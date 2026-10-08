import 'dotenv/config';
import { REST, Routes } from 'discord.js';

import { brand } from './config/brand.js';
import { config, validateConfig } from './config/config.js';
import { logger } from './utils/logger.js';
import { loadCommands } from './utils/loaders.js';

const clearing = process.argv.includes('--clear');
const useGlobal = process.argv.includes('--global') || config.globalCommands || !config.guildId;

async function main() {
  const { ok, missing } = validateConfig();
  if (!ok) {
    logger.error(`Missing required environment values: ${missing.join(', ')}`);
    process.exit(1);
  }

  const commands = await loadCommands();
  const body = clearing ? [] : commands.map((command) => command.data.toJSON());
  const rest = new REST({ version: '10' }).setToken(config.token);
  const route = useGlobal
    ? Routes.applicationCommands(config.clientId)
    : Routes.applicationGuildCommands(config.clientId, config.guildId);

  logger.info(
    clearing
      ? `Clearing ${useGlobal ? 'global' : `guild ${config.guildId}`} slash commands…`
      : `Registering ${body.length} ${brand.name} commands ${useGlobal ? 'globally' : `in guild ${config.guildId}`}…`,
  );

  try {
    const data = await rest.put(route, { body });
    logger.info(`Done — ${data.length} command(s) ${clearing ? 'cleared' : 'registered'}.`);
    if (useGlobal && !clearing) logger.info('Global commands can take up to an hour to appear on every server.');
    process.exit(0);
  } catch (error) {
    if (error.status === 401 || error.code === 50027) {
      logger.error('Discord rejected the token — check DISCORD_TOKEN in your .env file.');
    } else if (error.status === 403 || error.code === 50001) {
      logger.error('Discord refused the request — re-invite the bot with the "applications.commands" scope.');
    } else {
      logger.error(`Command deployment failed (${error.code ?? error.status ?? 'unknown'}): ${error.message}`);
    }
    process.exit(1);
  }
}

main();
