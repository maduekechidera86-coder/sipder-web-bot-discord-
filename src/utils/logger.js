import fs from 'node:fs';
import path from 'node:path';

import { brand } from '../config/brand.js';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const COLOURS = {
  error: '\x1b[31m',
  warn: '\x1b[33m',
  info: '\x1b[36m',
  debug: '\x1b[90m',
  reset: '\x1b[0m',
};

/** Anything shaped like a Discord bot token is never written to console or disk. */
const SECRET_PATTERNS = [
  /[A-Za-z0-9_-]{23,30}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,45}/g,
  /(token|secret|apikey|api_key|password)\s*[:=]\s*\S+/gi,
];

export function redact(value) {
  let text = typeof value === 'string' ? value : String(value ?? '');
  text = text.replace(SECRET_PATTERNS[0], '[redacted token]');
  text = text.replace(SECRET_PATTERNS[1], (match) => `${match.split(/[:=]/)[0]}=[redacted]`);
  return text;
}

class Logger {
  constructor() {
    this.level = LEVELS[(process.env.LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;
    this.logDir = path.resolve('logs');
    this.logFile = path.join(this.logDir, 'bot.log');
    this.prefix = brand.short;
  }

  format(level, message) {
    return `[${new Date().toISOString()}] [${level.toUpperCase()}] [${this.prefix}] ${redact(message)}`;
  }

  write(level, message) {
    if (LEVELS[level] > this.level) return;
    const line = this.format(level, message);
    // eslint-disable-next-line no-console
    console.log(`${COLOURS[level] ?? ''}${line}${COLOURS.reset}`);
    this.append(line);
  }

  append(line) {
    try {
      fs.mkdirSync(this.logDir, { recursive: true });
      fs.appendFileSync(this.logFile, `${line}\n`);
    } catch {
      /* logging must never take the bot down */
    }
  }

  error(message) {
    this.write('error', message);
  }

  warn(message) {
    this.write('warn', message);
  }

  info(message) {
    this.write('info', message);
  }

  debug(message) {
    this.write('debug', message);
  }

  /** Last N lines of the log file — powers the owner /logs command. */
  async readTail(lines = 25) {
    try {
      const raw = await fs.promises.readFile(this.logFile, 'utf8');
      return raw
        .split('\n')
        .filter(Boolean)
        .slice(-Math.max(1, Math.min(lines, 100)));
    } catch {
      return [];
    }
  }

  filePath() {
    return this.logFile;
  }
}

export const logger = new Logger();
export default logger;
