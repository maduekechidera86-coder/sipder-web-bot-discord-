import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { errorEmbed, webEmbed } from '../../utils/embeds.js';
import { buildInvite } from './botinfo.js';

const PRESETS = {
  minimal: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ReadMessageHistory,
  ],
  moderator: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.ManageNicknames,
    PermissionFlagsBits.ViewAuditLog,
  ],
  administrator: [PermissionFlagsBits.Administrator],
};

const invite = {
  data: new SlashCommandBuilder()
    .setName('invite')
    .setDescription(`Get the invite link for ${brand.short}`)
    .addStringOption((option) =>
      option
        .setName('preset')
        .setDescription('Which permission set the invite should request')
        .setRequired(false)
        .addChoices(
          { name: 'Full (recommended for /setup)', value: 'full' },
          { name: 'Moderator', value: 'moderator' },
          { name: 'Minimal (read + send)', value: 'minimal' },
        ),
    ),
  async run(interaction) {
    const preset = interaction.options.getString('preset') ?? 'full';
    const permissions = preset === 'full' ? null : PRESETS[preset];
    const url = buildInvite(interaction.client, permissions);

    if (!url) {
      return interaction.reply({
        embeds: [errorEmbed('Could not build an invite', 'Discord rejected the permission set — invite the bot manually from the Developer portal.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      embeds: [
        webEmbed({
          title: `${brand.emoji.web} Invite ${brand.short}`,
          description: `Preset: **${preset}**\n[Click to add the bot to a server](${url})`,
          fields: [
            { name: 'Scopes', value: '`bot` + `applications.commands`', inline: true },
            { name: 'Setup', value: 'Run `/setup` after inviting', inline: true },
          ],
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default [invite];
