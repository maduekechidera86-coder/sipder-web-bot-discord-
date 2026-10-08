import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { logger } from './logger.js';

/** Recursive, convention-over-configuration loading for commands and events. */

export const SRC_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const COMMANDS_DIR = path.join(SRC_DIR, 'commands');
export const EVENTS_DIR = path.join(SRC_DIR, 'events');

async function collectFiles(dir, extension = '.js') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full, extension)));
    } else if (entry.isFile() && entry.name.endsWith(extension) && !entry.name.startsWith('.')) {
      files.push(full);
    }
  }
  return files.sort();
}

function relative(file) {
  return path.relative(SRC_DIR, file);
}

/**
 * A command file exports either one { data, run } object or an array of them.
 * `fresh` busts the ESM cache so /reload really reloads the code from disk.
 */
export async function loadCommands({ fresh = false } = {}) {
  let files = [];
  try {
    files = await collectFiles(COMMANDS_DIR);
  } catch {
    logger.warn('No commands directory found — nothing to load.');
    return [];
  }

  const commands = [];
  for (const file of files) {
    try {
      const url = pathToFileURL(file).href + (fresh ? `?update=${Date.now()}` : '');
      const module = await import(url);
      const exported = module.default ?? module.command;
      const list = Array.isArray(exported) ? exported : [exported];
      const category = path.basename(path.dirname(file));

      for (const command of list) {
        if (!command?.data?.name || typeof command.run !== 'function') {
          logger.warn(`Skipped ${relative(file)} — export { data, run } as default.`);
          continue;
        }
        commands.push({ ...command, category, file });
      }
    } catch (error) {
      logger.error(`Could not load ${relative(file)}: ${error.message}`);
    }
  }

  return commands.sort((a, b) => a.data.name.localeCompare(b.data.name));
}

export async function loadEvents(client) {
  let files = [];
  try {
    files = await collectFiles(EVENTS_DIR);
  } catch {
    logger.warn('No events directory found — nothing to load.');
    return 0;
  }

  let registered = 0;
  for (const file of files) {
    try {
      const module = await import(pathToFileURL(file).href);
      const exported = module.default ?? module.event;
      const list = Array.isArray(exported) ? exported : [exported];

      for (const event of list) {
        if (!event?.name || typeof event.run !== 'function') {
          logger.warn(`Skipped ${relative(file)} — export { name, run } as default.`);
          continue;
        }
        const handler = (...args) => {
          Promise.resolve(event.run(...args)).catch((error) => {
            logger.error(`Event "${event.name}" failed: ${error?.stack ?? error?.message ?? error}`);
          });
        };
        if (event.once) client.once(event.name, handler);
        else client.on(event.name, handler);
        registered += 1;
      }
    } catch (error) {
      logger.error(`Could not load ${relative(file)}: ${error.message}`);
    }
  }

  logger.info(`Registered ${registered} event listener(s).`);
  return registered;
}

export default loadCommands;
