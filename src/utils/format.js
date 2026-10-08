/** Small shared formatting helpers — no command re-implements these. */

export function truncate(text, max = 100, suffix = '…') {
  if (!text) return '';
  const value = String(text);
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - suffix.length))}${suffix}`;
}

export function chunk(text, size = 1900) {
  const value = String(text ?? '');
  if (!value) return [''];
  const parts = [];
  for (let index = 0; index < value.length; index += size) parts.push(value.slice(index, index + size));
  return parts;
}

/** Splits long text on line breaks where possible (used by AI replies later). */
export function splitMessage(text, limit = 1900) {
  const value = String(text ?? '');
  if (value.length <= limit) return [value];

  const parts = [];
  let buffer = '';
  for (const line of value.split('\n')) {
    if ((buffer + line).length > limit) {
      if (buffer) parts.push(buffer);
      while (line.length > limit) {
        parts.push(line.slice(0, limit));
        // eslint-disable-next-line no-param-reassign
        line = line.slice(limit);
      }
      buffer = line;
    } else {
      buffer += `${buffer ? '\n' : ''}${line}`;
    }
  }
  if (buffer) parts.push(buffer);
  return parts;
}

const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/** "10m" → 600000. Returns null when the input is not a valid duration. */
export function parseDuration(input) {
  if (input === undefined || input === null) return null;
  const value = String(input).trim().toLowerCase();
  if (!value) return null;

  const pattern = /(\d+(?:\.\d+)?)\s*(w|d|h|m|s)/g;
  let total = 0;
  let matched = false;
  let match = pattern.exec(value);
  while (match) {
    matched = true;
    total += Number(match[1]) * UNIT_MS[match[2]];
    match = pattern.exec(value);
  }
  if (!matched) {
    const bare = Number(value);
    return Number.isFinite(bare) ? bare * 1000 : null;
  }
  return Math.round(total);
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms) || 0));
  const days = Math.floor(total / UNIT_MS.d);
  const hours = Math.floor((total % UNIT_MS.d) / UNIT_MS.h);
  const minutes = Math.floor((total % UNIT_MS.h) / UNIT_MS.m);
  const seconds = Math.floor((total % UNIT_MS.m) / 1000);

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds && !days) parts.push(`${seconds}s`);
  return parts.join(' ') || '0s';
}

/** Short form for uptime: 3d 4h 12m */
export function formatUptime(ms) {
  return formatDuration(ms);
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value) || 0);
}

export function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - Number(timestamp || Date.now())) / 1000);
  if (seconds < 60) return `${Math.max(seconds, 0)}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  const units = ['B', 'KB', 'MB', 'GB'];
  let index = 0;
  let size = value;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/** Replaces {user} {server} {membercount} {tag} placeholders in welcome/goodbye text. */
export function applyPlaceholders(template, { member, guild }) {
  return String(template ?? '')
    .replaceAll('{user}', member ? `<@${member.id}>` : 'someone')
    .replaceAll('{tag}', member?.user?.tag ?? 'unknown')
    .replaceAll('{server}', guild?.name ?? 'the server')
    .replaceAll('{membercount}', String(guild?.memberCount ?? 0))
    .replaceAll('{name}', member?.displayName ?? 'friend');
}

export const OWNER_ONLY_NOTE = 'Only the bot owner can use this command.';
