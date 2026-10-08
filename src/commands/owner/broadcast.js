import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { database } from '../../database/index.js';
import { ownerEmbed, webEmbed } from '../../utils/embeds.js';
import { truncate } from '../../utils/format.js';
import { logger } from '../../utils/logger.js';
import { guardOwner } from '../../utils/permissions.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Finds the channel a guild should receive an announcement in. */
async function resolveTargetChannel(guild, { channelName = null, preferConfigured = true }) {
  if (preferConfigured) {
    const configured = database.settings(guild.id).announcementChannelId;
    if (configured) {
      const channel = guild.channels.cache.get(configured) ?? (await guild.channels.fetch(configured).catch(() => null));
      if (channel?.isTextBased?.()) return channel;
    }
  }

  const name = channelName ?? '📢・announcements';
  const byName = guild.channels.cache.find(
    (channel) => channel.isTextBased() && channel.name.toLowerCase() === name.toLowerCase(),
  );
  if (byName) return byName;

  const fallback = guild.channels.cache.find(
    (channel) =>
      channel.isTextBased() && channel.type === ChannelType.GuildText && channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages),
  );
  return fallback ?? null;
}

async function broadcast(interaction, { title, body, channelName, preferConfigured }) {
  const guilds = [...interaction.client.guilds.cache.values()];
  const results = { sent: [], skipped: [], failed: [] };

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  for (const [index, guild] of guilds.entries()) {
    try {
      const channel = await resolveTargetChannel(guild, { channelName, preferConfigured });
      if (!channel) {
        results.skipped.push(`${guild.name} — no usable channel`);
        continue;
      }
      if (!channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)) {
        results.skipped.push(`${guild.name} — no permission in #${channel.name}`);
        continue;
      }

      // eslint-disable-next-line no-await-in-loop
      await channel.send({
        embeds: [
          webEmbed({
            title: truncate(title, 250),
            description: body,
            color: brand.colors.primary,
            author: { name: `${brand.name} — ${brand.owner}`, iconURL: interaction.client.user.displayAvatarURL({ size: 64 }) },
            footer: brand.footer,
          }),
        ],
        allowedMentions: { parse: [] },
      });

      results.sent.push(`${guild.name} → #${channel.name}`);

      if (index % 3 === 0) {
        // eslint-disable-next-line no-await-in-loop
        await interaction
          .editReply({
            embeds: [
              ownerEmbed('Broadcasting…', `${results.sent.length}/${guilds.length} servers reached`, [
                { name: 'Skipped', value: String(results.skipped.length), inline: true },
                { name: 'Failed', value: String(results.failed.length), inline: true },
              ]),
            ],
          })
          .catch(() => null);
      }

      // eslint-disable-next-line no-await-in-loop
      await delay(400); // keep well inside Discord's rate limits
    } catch (error) {
      results.failed.push(`${guild.name} — ${error.message}`);
      logger.warn(`Broadcast to ${guild.name} failed: ${error.message}`);
    }
  }

  return interaction.editReply({
    embeds: [
      ownerEmbed('Broadcast finished', body, [
        { name: `✅ Sent (${results.sent.length})`, value: truncate(results.sent.join('\n') || 'none', 1020), inline: false },
        { name: `⚠️ Skipped (${results.skipped.length})`, value: truncate(results.skipped.join('\n') || 'none', 1020), inline: false },
        { name: `❌ Failed (${results.failed.length})`, value: truncate(results.failed.join('\n') || 'none', 1020), inline: false },
      ]),
    ],
  });
}

const broadcastCommand = {
  data: new SlashCommandBuilder()
    .setName('broadcast')
    .setDescription('Owner: announce to every server, using each one’s announcement channel')
    .addStringOption((option) => option.setName('title').setDescription('Headline').setRequired(true).setMaxLength(200))
    .addStringOption((option) => option.setName('message').setDescription('Body text').setRequired(true).setMaxLength(3000)),
  async run(interaction) {
    const ownerCheck = guardOwner(interaction.user.id, database.isOwner(interaction.user.id), { action: 'broadcast' });
    if (!ownerCheck.ok) return interaction.reply({ embeds: [ownerEmbed('Owner only', ownerCheck.message)], flags: MessageFlags.Ephemeral });

    return broadcast(interaction, {
      title: interaction.options.getString('title'),
      body: interaction.options.getString('message'),
      channelName: null,
      preferConfigured: true,
    });
  },
};

const announceall = {
  data: new SlashCommandBuilder()
    .setName('announceall')
    .setDescription('Owner: post in one specific channel name across every server')
    .addStringOption((option) => option.setName('channel_name').setDescription('Channel name to post in').setRequired(true).setMaxLength(90))
    .addStringOption((option) => option.setName('message').setDescription('Message text').setRequired(true).setMaxLength(3000)),
  async run(interaction) {
    const ownerCheck = guardOwner(interaction.user.id, database.isOwner(interaction.user.id), { action: 'announce everywhere' });
    if (!ownerCheck.ok) return interaction.reply({ embeds: [ownerEmbed('Owner only', ownerCheck.message)], flags: MessageFlags.Ephemeral });

    return broadcast(interaction, {
      title: `${brand.name}`,
      body: interaction.options.getString('message'),
      channelName: interaction.options.getString('channel_name'),
      preferConfigured: false,
    });
  },
};

export default [broadcastCommand, announceall];
