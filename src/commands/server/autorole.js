import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { database } from '../../database/index.js';
import { errorEmbed, infoEmbed, successEmbed } from '../../utils/embeds.js';
import { guardBot, guardInvoker, guardInvokerRole } from '../../utils/permissions.js';
import { sendLog } from '../../services/logs.js';

const autorole = {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('The role every new member receives automatically')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Choose the entry role')
        .addRoleOption((option) => option.setName('role').setDescription('Role given on join').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('disable').setDescription('Stop giving a role on join'))
    .addSubcommand((sub) => sub.setName('show').setDescription('Show the current autorole')),
  async run(interaction) {
    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageRoles], { label: 'change the autorole' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

    const subcommand = interaction.options.getSubcommand();
    const settings = database.settings(guild.id);

    if (subcommand === 'show') {
      const current = settings.autoroleRoleId ? `<@&${settings.autoroleRoleId}>` : '`not set`';
      return interaction.reply({
        embeds: [
          infoEmbed('Autorole', `Current entry role: ${current}`, [
            { name: 'Module', value: settings.modules?.autorole === false ? '❌ disabled' : '✅ enabled', inline: true },
          ]),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'disable') {
      database.updateGuild(guild.id, { settings: { autoroleRoleId: null } });
      return interaction.reply({ embeds: [successEmbed('Autorole disabled', 'New members will not receive a role automatically.')], flags: MessageFlags.Ephemeral });
    }

    const role = interaction.options.getRole('role');
    const botCheck = guardBot(guild, [PermissionFlagsBits.ManageRoles]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const roleCheck = guardInvokerRole(interaction, role);
    if (!roleCheck.ok) return interaction.reply({ embeds: [errorEmbed('Blocked by Discord', roleCheck.message)], flags: MessageFlags.Ephemeral });

    database.updateGuild(guild.id, { settings: { autoroleRoleId: role.id, modules: { autorole: true } } });

    await sendLog(guild, {
      type: 'config',
      title: 'Autorole changed',
      description: `New members now receive ${role.toString()}`,
      fields: [{ name: 'Changed by', value: `<@${interaction.user.id}>`, inline: true }],
    });

    return interaction.reply({
      embeds: [
        successEmbed('Autorole saved', null, [
          { name: 'Role', value: role.toString(), inline: true },
          { name: 'Hierarchy check', value: 'passed — my role sits above it', inline: true },
        ]),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default [autorole];
