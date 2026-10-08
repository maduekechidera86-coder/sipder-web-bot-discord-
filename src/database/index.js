import { isPrimaryOwner } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { JsonStore } from './jsonStore.js';

/** Every collection the bot uses. Commands never touch the store directly. */
export const COLLECTIONS = Object.freeze({
  guilds: 'guilds',
  users: 'users',
  warnings: 'warnings',
  owners: 'owners',
  premium: 'premium',
  audit: 'audit',
  state: 'state',
});

const MAX_AUDIT_ENTRIES = 500;

function blankGuild(id, name = 'unknown') {
  return {
    id,
    name,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    setup: { version: null, completedAt: null },
    roles: {},
    categories: {},
    channels: {},
    settings: {
      welcomeChannelId: null,
      goodbyeChannelId: null,
      announcementChannelId: null,
      logChannelId: null,
      autoroleRoleId: null,
      verifyRoleId: null,
      verifyChannelId: null,
      verifyMessageId: null,
      welcomeMessage: null,
      goodbyeMessage: null,
      modules: { welcome: true, goodbye: true, autorole: true, logs: true },
    },
    counters: { commandsRun: 0, moderationsRun: 0 },
  };
}

/**
 * Storage abstraction. Swap JsonStore for SQLite/Postgres/Redis by reimplementing
 * the same handful of methods — no command file needs to change.
 */
class Database {
  constructor() {
    this.store = new JsonStore(process.env.DATABASE_PATH || './data/database.json');
    this.ready = false;
  }

  async init() {
    await this.store.init();
    this.ready = true;
    logger.info(
      `Storage ready — ${this.guildCount()} guild(s), ${this.userCount()} profile(s) at ${this.store.filePath}`,
    );
    return this;
  }

  // ── guilds ─────────────────────────────────────────────────────────────
  guild(guild) {
    const id = typeof guild === 'string' ? guild : guild?.id;
    const name = typeof guild === 'string' ? null : guild?.name ?? null;
    if (!id) throw new Error('database.guild() needs a guild id.');
    let record = this.store.get(COLLECTIONS.guilds, id, null);
    if (!record) {
      record = blankGuild(id, name ?? 'unknown');
      this.store.set(COLLECTIONS.guilds, id, record);
    } else if (name && record.name !== name) {
      record = this.updateGuild(id, { name });
    }
    return record;
  }

  updateGuild(guildId, patch = {}) {
    const current = this.guild(guildId);
    const next = { ...current, ...patch, updatedAt: Date.now() };
    if (patch.settings) {
      next.settings = {
        ...current.settings,
        ...patch.settings,
        modules: { ...current.settings.modules, ...(patch.settings.modules ?? {}) },
      };
    }
    for (const key of ['roles', 'categories', 'channels', 'setup', 'counters']) {
      if (patch[key]) next[key] = { ...current[key], ...patch[key] };
    }
    this.store.set(COLLECTIONS.guilds, guildId, next);
    return next;
  }

  settings(guildId) {
    return this.guild(guildId).settings;
  }

  setSetting(guildId, key, value) {
    return this.updateGuild(guildId, { settings: { [key]: value } }).settings[key];
  }

  toggleModule(guildId, module, enabled) {
    const current = this.settings(guildId);
    return this.updateGuild(guildId, { settings: { modules: { ...current.modules, [module]: enabled } } }).settings.modules[module];
  }

  guilds() {
    return this.store.values(COLLECTIONS.guilds);
  }

  guildCount() {
    return this.store.size(COLLECTIONS.guilds);
  }

  // ── users ──────────────────────────────────────────────────────────────
  user(userId, { username = null } = {}) {
    let record = this.store.get(COLLECTIONS.users, userId, null);
    if (!record) {
      const now = Date.now();
      record = { id: userId, username, firstSeen: now, lastSeen: now, commandsUsed: 0 };
      this.store.set(COLLECTIONS.users, userId, record);
    }
    return record;
  }

  touchUser(userId, { username = null } = {}) {
    return this.store.update(
      COLLECTIONS.users,
      userId,
      (current) => {
        const now = Date.now();
        if (!current) return { id: userId, username, firstSeen: now, lastSeen: now, commandsUsed: 1 };
        return {
          ...current,
          username: username ?? current.username,
          lastSeen: now,
          commandsUsed: (current.commandsUsed ?? 0) + 1,
        };
      },
      null,
    );
  }

  users() {
    return this.store.values(COLLECTIONS.users);
  }

  userCount() {
    return this.store.size(COLLECTIONS.users);
  }

  // ── warnings ───────────────────────────────────────────────────────────
  warningKey(guildId, userId) {
    return `${guildId}:${userId}`;
  }

  warnings(guildId, userId) {
    return this.store.get(COLLECTIONS.warnings, this.warningKey(guildId, userId), []);
  }

  addWarning(guildId, userId, entry) {
    return this.store.update(
      COLLECTIONS.warnings,
      this.warningKey(guildId, userId),
      (current = []) => [...current, { id: current.length + 1, createdAt: Date.now(), ...entry }],
      [],
    );
  }

  removeWarning(guildId, userId, warningId) {
    const list = [...this.warnings(guildId, userId)];
    const index = list.findIndex((warning) => String(warning.id) === String(warningId));
    if (index === -1) return null;
    const [removed] = list.splice(index, 1);
    this.store.set(COLLECTIONS.warnings, this.warningKey(guildId, userId), list);
    return removed;
  }

  clearWarnings(guildId, userId) {
    return this.store.remove(COLLECTIONS.warnings, this.warningKey(guildId, userId));
  }

  warningCount(guildId, userId) {
    return this.warnings(guildId, userId).length;
  }

  totalWarnings() {
    return this.store.values(COLLECTIONS.warnings).reduce((total, list) => total + (Array.isArray(list) ? list.length : 0), 0);
  }

  // ── owners ─────────────────────────────────────────────────────────────
  owners() {
    return this.store.get(COLLECTIONS.owners, 'list', []);
  }

  isOwner(userId) {
    if (isPrimaryOwner(userId)) return true;
    return this.owners().includes(String(userId));
  }

  addOwner(userId) {
    return this.store.update(COLLECTIONS.owners, 'list', (list = []) => (list.includes(String(userId)) ? list : [...list, String(userId)]), []);
  }

  removeOwner(userId) {
    return this.store.update(COLLECTIONS.owners, 'list', (list = []) => list.filter((id) => id !== String(userId)), []);
  }

  // ── premium ────────────────────────────────────────────────────────────
  premium(key) {
    return this.store.get(COLLECTIONS.premium, key, { active: false, tier: null, since: null, note: null });
  }

  setPremium(key, patch) {
    return this.store.set(COLLECTIONS.premium, key, { ...this.premium(key), ...patch });
  }

  premiumList() {
    return this.store
      .entries(COLLECTIONS.premium)
      .filter(([, value]) => value?.active)
      .map(([key, value]) => ({ key, ...value }));
  }

  isPremiumGuild(guildId) {
    return Boolean(this.premium(`guild:${guildId}`).active);
  }

  // ── global state ───────────────────────────────────────────────────────
  state() {
    return this.store.get(COLLECTIONS.state, 'global', { maintenance: false, maintenanceSince: null, maintenanceBy: null });
  }

  setState(patch) {
    return this.store.set(COLLECTIONS.state, 'global', { ...this.state(), ...patch });
  }

  counters() {
    return this.store.get(COLLECTIONS.state, 'counters', {});
  }

  bump(key, by = 1) {
    return this.store.update(COLLECTIONS.state, 'counters', (counters = {}) => ({ ...counters, [key]: (counters[key] ?? 0) + by }), {});
  }

  // ── audit trail (also mirrored to the log channel by services/logs.js) ──
  audit(entry) {
    return this.store.update(
      COLLECTIONS.audit,
      'entries',
      (list = []) => [{ createdAt: Date.now(), ...entry }, ...list].slice(0, MAX_AUDIT_ENTRIES),
      [],
    );
  }

  auditEntries(limit = 10, { guildId = null, types = null } = {}) {
    let list = this.store.get(COLLECTIONS.audit, 'entries', []);
    if (guildId) list = list.filter((entry) => entry.guildId === guildId);
    if (types?.length) list = list.filter((entry) => types.includes(entry.type));
    return list.slice(0, limit);
  }

  stats() {
    return {
      guilds: this.guildCount(),
      users: this.userCount(),
      warnings: this.totalWarnings(),
      auditEntries: this.store.get(COLLECTIONS.audit, 'entries', []).length,
      counters: this.counters(),
      file: this.store.filePath,
    };
  }

  async flush() {
    return this.store.flush();
  }

  async close() {
    await this.store.close();
  }
}

export const database = new Database();
export default database;
