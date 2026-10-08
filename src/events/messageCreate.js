import { Events } from 'discord.js';

import { database } from '../database/index.js';
import { awardActivity, COOLDOWNS } from '../services/progression.js';
import { webEmbed } from '../utils/embeds.js';
import { logger } from '../utils/logger.js';

const MIN_LENGTH = 8;
const IGNORED_PREFIXES = ['/', '!', '-', '?', '.'];

/**
 * Passive activity: chatting earns XP and Aura — each on its own persistent
 * cooldown, so flooding a channel earns nothing. Bots, DMs and command-looking
 * messages are ignored.
 */
export default {
  name: Events.MessageCreate,

  async run(message) {
    if (!message.guild || message.author?.bot || message.system) return;
    if (!message.content || message.content.length < MIN_LENGTH) return;
    if (IGNORED_PREFIXES.some((prefix) => message.content.startsWith(prefix))) return;

    database.touchUser(message.author.id, { username: message.author.username });
    database.guild(message.guild);

    const granted = awardActivity(message.author.id);
    if (!granted.xp && !granted.aura) return;

    if (granted.leveled) {
      try {
        await message.channel.send({
          embeds: [
            webEmbed({
              title: `⚡ Level up — ${message.member?.displayName ?? message.author.username} reached level ${granted.level}`,
              description: `The web noticed. Keep crawling — \`/rank\` shows the next rank, \`/daily\` pays out every day.`,
            }),
          ],
          allowedMentions: { parse: [] },
        });
      } catch (error) {
        logger.debug(`Could not announce a level-up in ${message.guild.name}: ${error.message}`);
      }
    }
  },
};

export const ACTIVITY_CONFIG = Object.freeze({
  minLength: MIN_LENGTH,
  xpCooldownMs: COOLDOWNS.activityXp,
  auraCooldownMs: COOLDOWNS.activityAura,
});
