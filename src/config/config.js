import 'dotenv/config';

import { brand } from './brand.js';

function raw(name, fallback = '') {
  const value = process.env[name];
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

const missing = [];
function required(name) {
  const value = raw(name);
  if (!value) missing.push(name);
  return value;
}

const digitsOnly = (value) => value.replace(/[^0-9]/g, '');

/**
 * Central configuration. Nothing is read from process.env anywhere else in the
 * codebase, and no secret is ever hard-coded — everything sensitive lives in .env.
 */
export const config = {
  token: required('DISCORD_TOKEN'),
  clientId: required('CLIENT_ID'),
  ownerId: digitsOnly(raw('OWNER_ID')),
  guildId: digitsOnly(raw('GUILD_ID')),

  mediaApiEndpoint: (raw('MEDIA_API_ENDPOINT', 'https://prexzyapis.com') || 'https://prexzyapis.com').replace(/\/+$/, ''),
  apiTimeoutMs: Number(raw('API_TIMEOUT_MS', '15000')) || 15000,

  logLevel: (raw('LOG_LEVEL', 'info') || 'info').toLowerCase(),
  databasePath: raw('DATABASE_PATH', './data/database.json') || './data/database.json',
  globalCommands: raw('GLOBAL_COMMANDS', 'false').toLowerCase() === 'true',

  startedAt: Date.now(),
  presence: {
    activity: `${brand.tagline} • /help`,
    status: 'online',
  },
  setupBlueprintVersion: 1,
};

export function validateConfig() {
  return { ok: missing.length === 0, missing: [...missing] };
}

/** True only for the OWNER_ID in the environment — cannot be granted from Discord. */
export function isPrimaryOwner(userId) {
  return Boolean(config.ownerId) && String(userId) === config.ownerId;
}

/** Never print the token: handy for diagnostics and log lines. */
export function describeConfig() {
  return {
    endpoint: config.mediaApiEndpoint,
    scope: config.guildId ? `guild ${config.guildId}` : 'global',
    ownerConfigured: Boolean(config.ownerId),
    logLevel: config.logLevel,
  };
}
