import { database } from './index.js';

/**
 * The economy and progression records, stored in the SAME database file as the
 * guild, user, warning and owner data — same store, same atomic writes, same
 * flush on shutdown. Two extra collections, nothing else changes.
 */
export const ECONOMY = 'economy';
export const PROGRESSION = 'progression';

/** Hard ceilings so no amount a member can type can overflow or corrupt a balance. */
export const MAX_COINS = 1_000_000_000_000;
export const MAX_XP = 50_000_000;
export const MAX_AURA = 50_000_000;

function whole(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : fallback;
}

function clamp(value, max) {
  return Math.max(0, Math.min(whole(value), max));
}

function blankAccount(id) {
  return {
    id,
    wallet: 0,
    bank: 0,
    totalEarned: 0,
    totalSpent: 0,
    inventory: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function blankProgress(id) {
  return {
    id,
    xp: 0,
    aura: 0,
    level: 1,
    streak: 0,
    lastDaily: 0,
    lastXpAt: 0,
    lastAuraAt: 0,
    lastGrow: 0,
    giftsSent: 0,
    giftsReceived: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function healAccount(existing) {
  return {
    ...blankAccount(existing.id),
    ...existing,
    wallet: clamp(existing.wallet, MAX_COINS),
    bank: clamp(existing.bank, MAX_COINS),
    inventory: Array.isArray(existing.inventory) ? existing.inventory : [],
  };
}

function healProgress(existing) {
  return {
    ...blankProgress(existing.id),
    ...existing,
    xp: clamp(existing.xp, MAX_XP),
    aura: clamp(existing.aura, MAX_AURA),
    level: Math.max(1, whole(existing.level, 1)),
    streak: clamp(existing.streak, 100000),
  };
}

// ── accounts ───────────────────────────────────────────────────────────────
export function account(userId) {
  const id = String(userId);
  const existing = database.store.get(ECONOMY, id, null);
  if (existing) return healAccount(existing);
  const fresh = blankAccount(id);
  database.store.set(ECONOMY, id, fresh);
  return fresh;
}

export function saveAccount(record) {
  const next = {
    ...record,
    wallet: clamp(record.wallet, MAX_COINS),
    bank: clamp(record.bank, MAX_COINS),
    updatedAt: Date.now(),
  };
  database.store.set(ECONOMY, record.id, next);
  return next;
}

export function balanceOf(record) {
  return whole(record?.wallet) + whole(record?.bank);
}

export function accounts() {
  return database.store.values(ECONOMY).map(healAccount);
}

/** Adds coins to the wallet. Returns { ok, added, account } or { ok:false, reason }. */
export function addCoins(userId, amount, { reason = 'unknown' } = {}) {
  const value = whole(amount);
  if (value <= 0) return { ok: false, reason: 'invalid_amount' };
  const record = account(userId);
  const room = MAX_COINS - record.wallet;
  if (room <= 0) return { ok: false, reason: 'cap_reached', account: record };
  const added = Math.min(value, room);
  const next = saveAccount({
    ...record,
    wallet: record.wallet + added,
    totalEarned: record.totalEarned + added,
    lastEarnedWith: reason,
  });
  return { ok: true, added, account: next };
}

/** Takes coins from the wallet only when the balance covers it — never goes negative. */
export function takeCoins(userId, amount, { reason = 'unknown' } = {}) {
  const value = whole(amount);
  if (value <= 0) return { ok: false, reason: 'invalid_amount' };
  const record = account(userId);
  if (record.wallet < value) return { ok: false, reason: 'insufficient', account: record };
  const next = saveAccount({
    ...record,
    wallet: record.wallet - value,
    totalSpent: record.totalSpent + value,
    lastSpentWith: reason,
  });
  return { ok: true, account: next };
}

/** Member-to-member transfer. Refuses self-payment, negatives and overflow. */
export function transferCoins(fromId, toId, amount) {
  const from = String(fromId);
  const to = String(toId);
  if (from === to) return { ok: false, reason: 'self' };

  const value = whole(amount);
  if (value <= 0) return { ok: false, reason: 'invalid_amount' };

  const sender = account(from);
  if (sender.wallet < value) return { ok: false, reason: 'insufficient', account: sender };

  const receiver = account(to);
  if (MAX_COINS - receiver.wallet < value) return { ok: false, reason: 'cap_reached', account: receiver };

  saveAccount({ ...sender, wallet: sender.wallet - value, totalSpent: sender.totalSpent + value });
  const updated = saveAccount({
    ...receiver,
    wallet: receiver.wallet + value,
    totalEarned: receiver.totalEarned + value,
  });
  return { ok: true, amount: value, account: updated };
}

/** Moves coins between the wallet and the bank. direction: 'in' | 'out'. */
export function moveCoins(userId, amount, direction) {
  const value = whole(amount);
  if (value <= 0) return { ok: false, reason: 'invalid_amount' };
  const record = account(userId);

  if (direction === 'in') {
    if (record.wallet < value) return { ok: false, reason: 'insufficient_wallet', account: record };
    return { ok: true, account: saveAccount({ ...record, wallet: record.wallet - value, bank: record.bank + value }) };
  }

  if (record.bank < value) return { ok: false, reason: 'insufficient_bank', account: record };
  return { ok: true, account: saveAccount({ ...record, wallet: record.wallet + value, bank: record.bank - value }) };
}

// ── inventory ──────────────────────────────────────────────────────────────
export function inventory(userId) {
  return account(userId).inventory;
}

export function addItem(userId, itemId, quantity = 1) {
  const amount = whole(quantity);
  if (amount <= 0) return { ok: false, reason: 'invalid_amount' };
  const record = account(userId);
  const items = [...record.inventory];
  const found = items.find((entry) => entry.itemId === itemId);
  if (found) found.quantity += amount;
  else items.push({ itemId, quantity: amount, since: Date.now() });
  return { ok: true, account: saveAccount({ ...record, inventory: items }) };
}

export function removeItem(userId, itemId, quantity = 1) {
  const amount = whole(quantity);
  const record = account(userId);
  const found = record.inventory.find((entry) => entry.itemId === itemId);
  if (!found || found.quantity < amount) return { ok: false, reason: 'not_owned', account: record };
  const items = record.inventory
    .map((entry) => (entry.itemId === itemId ? { ...entry, quantity: entry.quantity - amount } : entry))
    .filter((entry) => entry.quantity > 0);
  return { ok: true, account: saveAccount({ ...record, inventory: items }) };
}

export function itemCount(userId, itemId) {
  return inventory(userId).find((entry) => entry.itemId === itemId)?.quantity ?? 0;
}

// ── progression ────────────────────────────────────────────────────────────
export function progress(userId) {
  const id = String(userId);
  const existing = database.store.get(PROGRESSION, id, null);
  if (existing) return healProgress(existing);
  const fresh = blankProgress(id);
  database.store.set(PROGRESSION, id, fresh);
  return fresh;
}

export function saveProgress(record) {
  const next = { ...record, updatedAt: Date.now() };
  database.store.set(PROGRESSION, record.id, next);
  return next;
}

export function progressRecords() {
  return database.store.values(PROGRESSION).map(healProgress);
}

export function clampXp(value) {
  return clamp(value, MAX_XP);
}

export function clampAura(value) {
  return clamp(value, MAX_AURA);
}

// ── resets and leaderboards ────────────────────────────────────────────────
export function resetAccount(userId) {
  return saveAccount({ ...account(userId), wallet: 0, bank: 0, inventory: [] });
}

export function resetProgress(userId) {
  return saveProgress({ ...progress(userId), xp: 0, aura: 0, level: 1, streak: 0, lastDaily: 0, lastXpAt: 0, lastAuraAt: 0, lastGrow: 0 });
}

/** field: 'total' | 'wallet' | 'bank' | 'earned'. */
export function economyLeaderboard(field = 'total', limit = 10) {
  const pick = {
    total: (record) => balanceOf(record),
    wallet: (record) => record.wallet,
    bank: (record) => record.bank,
    earned: (record) => record.totalEarned ?? 0,
  }[field] ?? ((record) => balanceOf(record));

  return accounts()
    .map((record) => ({ id: record.id, value: pick(record) }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** field: 'xp' | 'aura' | 'level' | 'streak'. */
export function progressionLeaderboard(field = 'xp', limit = 10) {
  const pick = {
    xp: (record) => record.xp,
    aura: (record) => record.aura,
    level: (record) => record.level,
    streak: (record) => record.streak,
  }[field] ?? ((record) => record.xp);

  return progressRecords()
    .map((record) => ({ id: record.id, value: pick(record) }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

export default account;
