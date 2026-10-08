import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { errorEmbed, modEmbed } from '../../utils/embeds.js';
import { truncate } from '../../utils/format.js';
import { guardBot, guardGuild, guardInvoker, guardTarget } from '../../utils/permissions.js';
import { logModerationAction } from '../../services/logs.js';

const nick = {
  data: new SlashCommandBuilder()
    .setName('nick')
    .setDescription('Change or clear a member nickname')
    .addUserOption((option) => option.setName('user').setDescription('Who to rename').setRequired(true))
    .addStringOption((option) => option.setName('name').setDescription('New nickname (leave empty to reset)').setRequired(false).setMaxLength(32))
    .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(false).setMaxLength(200)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });

    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageNicknames], { label: 'change nicknames' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const botCheck = guardBot(interaction.guild, [PermissionFlagsBits.ManageNicknames]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const targetCheck = await guardTarget(interaction, interaction.options.getUser('user').id, { action: 'rename', allowSelf: true });
    if (!targetCheck.ok) return interaction.reply({ embeds: [errorEmbed('Blocked by Discord', targetCheck.message)], flags: MessageFlags.Ephemeral });

    const target = targetCheck.target;
    const raw = interaction.options.getString('name');
    const name = raw ? truncate(raw.trim(), 32) : null;
    const reason = interaction.options.getString('reason') ?? `${interaction.user.tag} changed the nickname`;
    const previous = target.nickname ?? target.user.username;

    try {
      await target.setNickname(name, reason);
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Discord refused the change', error.message)], flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
      embeds: [
        modEmbed(name ? 'Nickname changed' : 'Nickname reset', null, [
          { name: 'Member', value: `${target.user.tag}`, inline: true },
          { name: 'Before', value: truncate(previous, 40), inline: true },
          { name: 'After', value: name ? truncate(name, 40) : (target.user.username), inline: true },
        ]),
      ],
      allowedMentions: { parse: [] },
    });

    await logModerationAction(interaction.guild, {
      action: name ? 'Nickname changed' : 'Nickname reset',
      moderator: interaction.user,
      target: target.user,
      reason,
      extra: [{ name: 'Previous', value: truncate(previous, 100), inline: true }],
    });
  },
};

export default [nick];
