import { ActivityType, Events } from 'discord.js';

import { brand } from '../config/brand.js';
import { config } from '../config/config.js';
import { database } from '../database/index.js';
import { prexzy } from '../services/prexzy.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.ClientReady,
  once: true,
  async run(client) {
    logger.info(
      `${brand.name} is awake — ${client.guilds.cache.size} server(s), ${client.commands.size} commands, connected as ${client.user.tag}.`,
    );

    try {
      client.user.setPresence({
        status: config.presence.status,
        activities: [{ name: config.presence.activity, type: ActivityType.Watching }],
      });
    } catch (error) {
      logger.warn(`Could not set the presence: ${error.message}`);
    }

    if (client.commands.size === 0) {
      logger.warn('No commands are loaded — run "npm run deploy", then restart the bot.');
    }

    const health = await prexzy.health();
    if (health.reachable) {
      logger.info(`API layer reachable — ${health.endpoint} answered HTTP ${health.status} in ${health.ms}ms.`);
    } else {
      logger.warn(`API layer unreachable at ${health.endpoint} (${health.error}). API-backed commands will report the failure instead of pretending to work.`);
    }

    const stats = database.stats();
    logger.info(`State on disk: ${stats.guilds} guild(s), ${stats.users} profile(s), ${stats.warnings} warning(s), ${stats.auditEntries} audit entr(ies).`);
  },
};
