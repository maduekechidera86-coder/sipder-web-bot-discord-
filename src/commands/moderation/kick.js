import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { errorEmbed, modEmbed } from '../../utils/embeds.js';
import { truncate } from '../../utils/format.js';
import { guardBot, guardGuild, guardInvoker, guardTarget } from '../../utils/permissions.js';
import { logModerationAction } from '../../services/logs.js';

const kick = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a member from the server')
    .addUserOption((option) => option.setName('user').setDescription('Who to kick').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(false).setMaxLength(400))
    .addBooleanOption((option) => option.setName('notify').setDescription('DM them the reason first').setRequired(false)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });

    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.KickMembers], { label: 'kick members' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const botCheck = guardBot(interaction.guild, [PermissionFlagsBits.KickMembers]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const targetCheck = await guardTarget(interaction, interaction.options.getUser('user').id, { action: 'kick' });
    if (!targetCheck.ok) return interaction.reply({ embeds: [errorEmbed('Blocked by Discord', targetCheck.message)], flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const target = targetCheck.target;
    const reason = truncate(`${interaction.user.tag}: ${interaction.options.getString('reason') ?? 'no reason given'}`, 400);

    if (interaction.options.getBoolean('notify')) {
      await target.user.send({ embeds: [errorEmbed(`You were kicked from ${guild.name}`, reason)] }).catch(() => null);
    }

    try {
      await target.kick(reason);
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Discord refused the kick', error.message)], flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
      embeds: [
        modEmbed('Member kicked', null, [
          { name: 'Target', value: `${target.user.tag} (\`${target.id}\`)`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
        ]),
      ],
      allowedMentions: { parse: [] },
    });

    await logModerationAction(guild, { action: 'Kick', moderator: interaction.user, target: target.user, reason });
  },
};

export default [kick];
