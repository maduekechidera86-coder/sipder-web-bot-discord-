import { brand } from '../config/brand.js';
import { database } from '../database/index.js';
import { logger } from './logger.js';

let shuttingDown = false;

export function isShuttingDown() {
  return shuttingDown;
}

/**
 * The only shutdown path: flush the database, close the Discord connection, exit.
 * /restart and /shutdown use it, and so do SIGINT / SIGTERM — so data is never lost.
 */
export async function softShutdown({ reason = 'manual', code = 0, client = null } = {}) {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.warn(`${brand.name} is going to sleep (${reason}) — saving data first.`);
  try {
    await database.close();
    logger.info('Data saved.');
  } catch (error) {
    logger.error(`Could not save data: ${error.message}`);
  }

  try {
    client?.destroy();
  } catch {
    /* the process is about to end anyway */
  }

  process.exit(code);
}

export default softShutdown;
