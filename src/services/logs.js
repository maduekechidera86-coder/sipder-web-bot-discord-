import { PermissionFlagsBits } from 'discord.js';

import { brand } from '../config/brand.js';
import { database } from '../database/index.js';
import { webEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

/** Visual style per log type — keeps every log embed consistent and readable. */
const STYLES = {
  moderation: { emoji: brand.emoji.shield, color: brand.colors.primary, label: 'Moderation' },
  member: { emoji: brand.emoji.web, color: brand.colors.info, label: 'Member' },
  server: { emoji: brand.emoji.gear, color: brand.colors.silver, label: 'Server' },
  config: { emoji: brand.emoji.gear, color: brand.colors.warning, label: 'Configuration' },
  security: { emoji: brand.emoji.spider, color: brand.colors.error, label: 'Security' },
  owner: { emoji: brand.emoji.crown, color: brand.colors.fire ?? brand.colors.warning, label: 'Owner' },
  error: { emoji: brand.emoji.cross, color: brand.colors.error, label: 'Error' },
};

export function logStyle(type) {
  return STYLES[type] ?? STYLES.moderation;
}

/** Resolves the configured log channel, or null when logging is off / not permitted. */
export async function resolveLogChannel(guild) {
  try {
    const settings = database.settings(guild.id);
    if (!settings.logChannelId || settings.modules?.logs === false) return null;

    const channel =
      guild.channels.cache.get(settings.logChannelId) ??
      (await guild.channels.fetch(settings.logChannelId).catch(() => null));

    if (!channel?.isTextBased?.()) return null;

    const me = guild.members.me;
    const permissions = me ? channel.permissionsFor(me) : null;
    if (!permissions?.has(PermissionFlagsBits.SendMessages) || !permissions.has(PermissionFlagsBits.EmbedLinks)) return null;

    return channel;
  } catch {
    return null;
  }
}

/**
 * Writes an entry to the audit trail (database) and, when a log channel is
 * configured, posts the branded embed. Never throws — logging must not break a command.
 */
export async function sendLog(guild, { type = 'moderation', title, description = null, fields = [], color = null, thumbnail = null }) {
  if (!guild) return false;

  try {
    database.audit({
      guildId: guild.id,
      type,
      title,
      description: description ? description.slice(0, 500) : null,
      fields: fields.slice(0, 6).map((field) => ({ name: String(field.name).slice(0, 100), value: String(field.value).slice(0, 200) })),
    });
  } catch (error) {
    logger.warn(`Could not record an audit entry: ${error.message}`);
  }

  const channel = await resolveLogChannel(guild);
  if (!channel) return false;

  const style = logStyle(type);
  try {
    await channel.send({
      embeds: [
        webEmbed({
          title: `${style.emoji} ${title}`,
          description,
          fields,
          color: color ?? style.color,
          thumbnail,
          footer: `🕸️ ${style.label} log • ${brand.owner}`,
        }),
      ],
      allowedMentions: { parse: [] },
    });
    return true;
  } catch (error) {
    logger.warn(`Could not post a ${type} log in #${channel.name}: ${error.message}`);
    return false;
  }
}

/** Resolves a stored channel id into a usable text channel, or null. */
export async function resolveTextChannel(guild, channelId) {
  if (!guild || !channelId) return null;
  try {
    const channel =
      guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel?.isTextBased?.()) return null;
    const me = guild.members.me;
    const permissions = me ? channel.permissionsFor(me) : null;
    if (!permissions?.has(PermissionFlagsBits.SendMessages)) return null;
    return channel;
  } catch {
    return null;
  }
}

/** Convenience wrapper: record + log a moderation action performed by someone. */
export async function logModerationAction(guild, { action, moderator, target, reason = null, extra = [] }) {
  return sendLog(guild, {
    type: 'moderation',
    title: action,
    description: reason ? `**Reason:** ${reason}` : null,
    fields: [
      { name: 'Moderator', value: moderator ? `<@${moderator.id}>` : 'system', inline: true },
      { name: 'Target', value: target ? `<@${target.id}>` : '—', inline: true },
      ...extra,
    ],
    thumbnail: target?.displayAvatarURL?.({ size: 128 }) ?? null,
  });
}

export default sendLog;
