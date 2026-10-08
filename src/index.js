import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Options, Partials } from 'discord.js';

import { brand } from './config/brand.js';
import { config, validateConfig } from './config/config.js';
import { database } from './database/index.js';
import { registerGlobalErrorHandlers } from './utils/errors.js';
import { softShutdown } from './utils/lifecycle.js';
import { loadCommands, loadEvents } from './utils/loaders.js';
import { logger } from './utils/logger.js';

registerGlobalErrorHandlers();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
  ],
  partials: [Partials.Channel, Partials.GuildMember],
  allowedMentions: { parse: ['users', 'roles'], repliedUser: false },
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 50,
    PresenceManager: 0,
    ReactionManager: 0,
    GuildStickerManager: 0,
  }),
});

client.commands = new Collection();
client.startedAt = Date.now();

async function bootstrap() {
  const { ok, missing } = validateConfig();
  if (!ok) {
    logger.error(`Missing required environment values: ${missing.join(', ')}`);
    logger.error('Copy ".env.example" to ".env", fill in the missing values, then start the bot again.');
    process.exit(1);
  }

  if (!config.ownerId) logger.warn('OWNER_ID is not set — owner commands stay locked until you add it.');
  if (!config.guildId && !config.globalCommands) {
    logger.warn('GUILD_ID is not set — deploy with "npm run deploy:global" (commands can take up to an hour to appear).');
  }

  await database.init();

  const commands = await loadCommands();
  for (const command of commands) {
    if (client.commands.has(command.data.name)) {
      logger.warn(`Duplicate command name "${command.data.name}" in ${command.file} — keeping the first one.`);
      continue;
    }
    client.commands.set(command.data.name, command);
  }
  const categories = new Set(commands.map((command) => command.category));
  logger.info(`${brand.name} loaded ${client.commands.size} commands across ${categories.size} categories.`);

  await loadEvents(client);

  await client.login(config.token);
}

process.on('SIGINT', () => softShutdown({ reason: 'SIGINT', client }));
process.on('SIGTERM', () => softShutdown({ reason: 'SIGTERM', client }));

bootstrap().catch(async (error) => {
  logger.error(`Startup failed: ${error.message}`);
  if (/invalid token/i.test(error.message)) {
    logger.error('Check DISCORD_TOKEN in your .env file (Developer portal → Bot → Reset Token).');
  }
  if (/disallowed intents/i.test(error.message)) {
    logger.error('Enable "SERVER MEMBERS INTENT" in the Developer portal → Bot → Privileged Gateway Intents.');
  }
  await database.close().catch(() => {});
  process.exit(1);
});
