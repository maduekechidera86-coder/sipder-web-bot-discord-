import { brand } from '../config/brand.js';
import { database } from '../database/index.js';
import { formatDuration } from './format.js';

/**
 * Anti-abuse cooldowns for FUN, ECONOMY, AURA and AI commands.
 *
 * They live in the SAME database file as everything else, so restarting the bot
 * cannot be used to reset a cooldown. Nothing here is kept in memory.
 */
const COLLECTION = 'cooldowns';

function keyOf(scope, id) {
  return `${scope}:${id}`;
}

export function lastUsed(scope, id) {
  return Number(database.store.get(COLLECTION, keyOf(scope, id), 0)) || 0;
}

/** Milliseconds still to wait, or 0 when the cooldown is over. */
export function remaining(scope, id, ms) {
  const left = lastUsed(scope, id) + ms - Date.now();
  return left > 0 ? left : 0;
}

/** Starts (or restarts) the timer. Call this only once the action really succeeded. */
export function markUsed(scope, id) {
  database.store.set(COLLECTION, keyOf(scope, id), Date.now());
  return Date.now();
}

/** { ok: true } or { ok: false, message } — CHECKS without starting the timer. */
export function checkCooldown(scope, id, ms, { label = 'that' } = {}) {
  const left = remaining(scope, id, ms);
  if (left > 0) {
    return {
      ok: false,
      remaining: left,
      message: `${brand.emoji.moon} Slow down — **${label}** is ready again in **${formatDuration(left)}**.`,
    };
  }
  return { ok: true, remaining: 0 };
}

export function resetCooldown(scope, id) {
  return database.store.remove(COLLECTION, keyOf(scope, id));
}

/** Used by the owner /progression-reset command. */
export function resetScope(scope) {
  const bucket = database.store.collection(COLLECTION);
  let cleared = 0;
  for (const key of Object.keys(bucket)) {
    if (key.startsWith(`${scope}:`)) {
      database.store.remove(COLLECTION, key);
      cleared += 1;
    }
  }
  return cleared;
}

export default checkCooldown;
