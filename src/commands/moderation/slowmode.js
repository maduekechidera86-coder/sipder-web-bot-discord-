import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { errorEmbed, modEmbed } from '../../utils/embeds.js';
import { formatDuration } from '../../utils/format.js';
import { guardBot, guardGuild, guardInvoker } from '../../utils/permissions.js';
import { sendLog } from '../../services/logs.js';

const slowmode = {
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Set this channel slowmode (0 turns it off)')
    .addIntegerOption((option) =>
      option.setName('seconds').setDescription('0 – 21600 seconds').setRequired(true).setMinValue(0).setMaxValue(21_600),
    )
    .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(false).setMaxLength(200)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });

    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageChannels], { label: 'change channel settings' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const channel = interaction.channel;
    if (!channel?.isTextBased?.() || !channel.setRateLimitPerUser) {
      return interaction.reply({ embeds: [errorEmbed('Not here', 'This command needs a normal text channel.')], flags: MessageFlags.Ephemeral });
    }

    const botCheck = guardBot(interaction.guild, [PermissionFlagsBits.ManageChannels]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const seconds = interaction.options.getInteger('seconds');
    const reason = interaction.options.getString('reason') ?? `${interaction.user.tag} set slowmode`;

    try {
      await channel.setRateLimitPerUser(seconds, reason);
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Discord refused the change', error.message)], flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
      embeds: [
        modEmbed('Slowmode updated', null, [
          { name: 'Channel', value: `<#${channel.id}>`, inline: true },
          { name: 'Slowmode', value: seconds ? `${seconds}s (${formatDuration(seconds * 1000)})` : 'off', inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
        ]),
      ],
    });

    await sendLog(interaction.guild, {
      type: 'config',
      title: 'Slowmode changed',
      description: `<#${channel.id}> → ${seconds ? `${seconds}s` : 'off'}`,
      fields: [{ name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true }],
    });
  },
};

export default [slowmode];
