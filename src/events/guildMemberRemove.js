import { Events } from 'discord.js';

import { brand } from '../config/brand.js';
import { BLUEPRINT } from '../config/serverBlueprint.js';
import { database } from '../database/index.js';
import { resolveTextChannel, sendLog } from '../services/logs.js';
import { webEmbed } from '../utils/embeds.js';
import { applyPlaceholders, timeAgo } from '../utils/format.js';
import { logger } from '../utils/logger.js';

/** Goodbye message for members leaving the web. */
export default {
  name: Events.GuildMemberRemove,

  async run(member) {
    const guild = member.guild;
    const settings = database.settings(guild.id);

    const profile = database.user(member.id, { username: member.user.username });
    const joinedAt = member.joinedTimestamp ?? null;

    if (settings.modules?.goodbye !== false) {
      const channel = await resolveTextChannel(guild, settings.goodbyeChannelId);
      if (channel) {
        const template = settings.goodbyeMessage || BLUEPRINT.messages.goodbye;
        await channel
          .send({
            embeds: [
              webEmbed({
                title: `${brand.emoji.moon} A soul leaves the web`,
                description: applyPlaceholders(template, { member, guild }),
                color: brand.colors.info,
                thumbnail: member.user.displayAvatarURL({ size: 256 }),
                fields: joinedAt
                  ? [{ name: 'Was here since', value: `<t:${Math.floor(joinedAt / 1000)}:R> · seen ${timeAgo(profile.lastSeen)}`, inline: false }]
                  : [],
              }),
            ],
            allowedMentions: { parse: [] },
          })
          .catch((error) => logger.warn(`Goodbye message failed in ${guild.name}: ${error.message}`));
      }
    }

    await sendLog(guild, {
      type: 'member',
      title: 'Member left',
      description: `<@${member.id}> (${member.user.tag})`,
      fields: joinedAt ? [{ name: 'Joined', value: `<t:${Math.floor(joinedAt / 1000)}:R>`, inline: true }] : [],
    });
  },
};
