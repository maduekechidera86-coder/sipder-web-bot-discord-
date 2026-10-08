import { Events } from 'discord.js';

import { brand } from '../config/brand.js';
import { BLUEPRINT } from '../config/serverBlueprint.js';
import { database } from '../database/index.js';
import { resolveTextChannel, sendLog } from '../services/logs.js';
import { webEmbed } from '../utils/embeds.js';
import { applyPlaceholders } from '../utils/format.js';
import { logger } from '../utils/logger.js';
import { guardRole } from '../utils/permissions.js';

/** Welcome message + autorole. Both are optional and controlled by /config and /autorole. */
export default {
  name: Events.GuildMemberAdd,

  async run(member) {
    const guild = member.guild;
    const settings = database.settings(guild.id);
    database.user(member.id, { username: member.user.username });

    if (member.user.bot) return;

    // ── autorole ───────────────────────────────────────────────────────────
    if (settings.modules?.autorole !== false && settings.autoroleRoleId) {
      const role =
        guild.roles.cache.get(settings.autoroleRoleId) ??
        (await guild.roles.fetch(settings.autoroleRoleId).catch(() => null));
      const check = guardRole(guild, role);
      if (check.ok) {
        await member.roles.add(role, `${brand.short} autorole`).catch((error) => {
          logger.warn(`Autorole failed in ${guild.name}: ${error.message}`);
        });
      } else {
        logger.warn(`Autorole skipped in ${guild.name}: ${check.message}`);
      }
    }

    // ── welcome message ────────────────────────────────────────────────────
    if (settings.modules?.welcome === false) return;

    const channel = await resolveTextChannel(guild, settings.welcomeChannelId);
    if (!channel) return;

    const template = settings.welcomeMessage || BLUEPRINT.messages.welcome;
    const description = applyPlaceholders(template, { member, guild });

    const embed = webEmbed({
      title: `${brand.emoji.web} A new soul enters the web`,
      description,
      color: brand.colors.primary,
      thumbnail: member.user.displayAvatarURL({ size: 256 }),
      fields: [
        { name: `${brand.emoji.moon} Account created`, value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: `${brand.emoji.spider} Member count`, value: String(guild.memberCount), inline: true },
      ],
    });

    await channel
      .send({ content: `<@${member.id}>`, embeds: [embed], allowedMentions: { users: [member.id] } })
      .catch((error) => logger.warn(`Welcome message failed in ${guild.name}: ${error.message}`));

    await sendLog(guild, {
      type: 'member',
      title: 'Member joined',
      description: `<@${member.id}> (${member.user.tag})`,
      fields: [
        { name: 'Account created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Members now', value: String(guild.memberCount), inline: true },
      ],
    });
  },
};
