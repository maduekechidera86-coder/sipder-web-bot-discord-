import { brand } from '../config/brand.js';
import { account, addCoins, progress, saveProgress, clampAura, clampXp } from '../database/progression.js';
import { checkCooldown, markUsed, remaining } from '../utils/cooldowns.js';
import { progressBar, webEmbed } from '../utils/embeds.js';
import { formatNumber } from '../utils/format.js';

/** Everything about levels, XP, ranks and aura lives here. */

export const MAX_LEVEL = 100;

export const RANKS = [
  { key: 'webborn', name: '🕸️ Webborn', level: 1 },
  { key: 'walker', name: '⚡ Web Walker', level: 5 },
  { key: 'crawler', name: '🔥 Shadow Crawler', level: 15 },
  { key: 'hunter', name: '💀 Night Hunter', level: 30 },
  { key: 'lord', name: '👑 Web Lord', level: 50 },
  { key: 'king', name: '🕷️ Spider King', level: 75 },
  { key: 'nightmare', name: '☠️ NIGHTMARE', level: 100 },
];

export const COOLDOWNS = Object.freeze({
  activityXp: 60_000, // one XP tick per minute of chatting — no XP spam
  activityAura: 120_000, // one aura tick every two minutes
  daily: 20 * 3_600_000,
  work: 3_600_000,
  grow: 6 * 3_600_000,
  gift: 30_000,
  fun: 6_000,
  ai: 15_000,
});

export const MESSAGE_XP = { min: 8, max: 16 };
export const MESSAGE_AURA = { min: 1, max: 3 };

/** XP needed to move FROM `level` to the next one. */
export function xpForLevel(level) {
  const safe = Math.min(Math.max(1, Math.trunc(level || 1)), MAX_LEVEL);
  return 100 + (safe - 1) * 90;
}

/** Total XP required to reach `level`. */
export function totalXpForLevel(level) {
  const target = Math.min(Math.max(1, Math.trunc(level || 1)), MAX_LEVEL);
  let total = 0;
  for (let step = 1; step < target; step += 1) total += xpForLevel(step);
  return total;
}

export function levelFromXp(totalXp) {
  let level = 1;
  let spent = 0;
  while (level < MAX_LEVEL) {
    const needed = xpForLevel(level);
    if (spent + needed > totalXp) break;
    spent += needed;
    level += 1;
  }
  return level;
}

export function rankForLevel(level) {
  let found = RANKS[0];
  for (const rank of RANKS) if (level >= rank.level) found = rank;
  return found;
}

export function nextRankForLevel(level) {
  return RANKS.find((rank) => rank.level > level) ?? null;
}

/** The card every command and leaderboard renders from. */
export function card(userId) {
  const record = progress(userId);
  const level = levelFromXp(record.xp);
  const spent = totalXpForLevel(level);
  const needed = xpForLevel(level);
  const current = record.xp - spent;
  const rank = rankForLevel(level);
  const next = nextRankForLevel(level);

  return {
    ...record,
    level,
    rank,
    nextRank: next,
    xpIntoLevel: current,
    xpForNextLevel: needed,
    xpTotalForLevel: spent,
    ratio: needed > 0 ? Math.min(current / needed, 1) : 1,
    bar: progressBar(current, needed, 12),
    maxed: level >= MAX_LEVEL,
  };
}

/**
 * Adds XP, recomputes the level, detects a level-up and pays the reward once.
 * Returns { ok, gained, leveled, level, rank, rewards }.
 */
export function awardXp(userId, amount, { source = 'unknown' } = {}) {
  const value = Math.max(0, Math.trunc(Number(amount) || 0));
  if (value === 0) return { ok: false, reason: 'invalid_amount' };

  const before = progress(userId);
  const beforeLevel = levelFromXp(before.xp);
  const after = saveProgress({ ...before, xp: clampXp(before.xp + value), lastXpAt: Date.now(), lastXpSource: source });
  const afterLevel = levelFromXp(after.xp);
  const leveled = afterLevel > beforeLevel;

  const rewards = { coins: 0, aura: 0 };
  if (leveled) {
    rewards.coins = 60 * afterLevel;
    rewards.aura = 25 * afterLevel;
    addCoins(userId, rewards.coins, { reason: 'level-up' });
    saveProgress({ ...progress(userId), aura: clampAura(progress(userId).aura + rewards.aura) });
  }

  return { ok: true, gained: value, leveled, level: afterLevel, rank: rankForLevel(afterLevel), rewards };
}

export function awardAura(userId, amount, { source = 'unknown' } = {}) {
  const value = Math.max(0, Math.trunc(Number(amount) || 0));
  if (value === 0) return { ok: false, reason: 'invalid_amount' };
  const before = progress(userId);
  const after = saveProgress({ ...before, aura: clampAura(before.aura + value), lastAuraAt: Date.now(), lastAuraSource: source });
  return { ok: true, gained: value, aura: after.aura };
}

/**
 * Message activity: XP and aura, each on its own cooldown, so spamming does
 * nothing. Returns what was actually granted (often nothing).
 */
export function awardActivity(userId) {
  const granted = { xp: 0, aura: 0, leveled: false, level: null };

  if (!remaining('xp', userId, COOLDOWNS.activityXp)) {
    const amount = MESSAGE_XP.min + Math.floor(Math.random() * (MESSAGE_XP.max - MESSAGE_XP.min + 1));
    const result = awardXp(userId, amount, { source: 'message' });
    if (result.ok) {
      markUsed('xp', userId);
      granted.xp = amount;
      granted.leveled = result.leveled;
      granted.level = result.level;
    }
  }

  if (!remaining('aura', userId, COOLDOWNS.activityAura)) {
    const amount = MESSAGE_AURA.min + Math.floor(Math.random() * (MESSAGE_AURA.max - MESSAGE_AURA.min + 1));
    const result = awardAura(userId, amount, { source: 'message' });
    if (result.ok) {
      markUsed('aura', userId);
      granted.aura = amount;
    }
  }

  return granted;
}

export function xpCooldown(userId) {
  return remaining('xp', userId, COOLDOWNS.activityXp);
}

export function auraCooldown(userId) {
  return remaining('aura', userId, COOLDOWNS.activityAura);
}

// ── owner controls ─────────────────────────────────────────────────────────
export function setXp(userId, total) {
  const value = clampXp(total);
  return saveProgress({ ...progress(userId), xp: value });
}

export function setAura(userId, total) {
  return saveProgress({ ...progress(userId), aura: clampAura(total) });
}

export const dailyCooldown = (userId) => remaining('daily', userId, COOLDOWNS.daily);
export const workCooldown = (userId) => remaining('work', userId, COOLDOWNS.work);
export const growCooldown = (userId) => remaining('grow', userId, COOLDOWNS.grow);
export const markDaily = (userId) => markUsed('daily', userId);
export const markWork = (userId) => markUsed('work', userId);
export const markGrow = (userId) => markUsed('grow', userId);
export const checkFun = (userId, label, ms = COOLDOWNS.fun) => checkCooldown('fun', userId, ms, { label });
export const markFun = (userId) => markUsed('fun', userId);
export const markAi = (userId) => markUsed('ai', userId);
export const checkAi = (userId) => checkCooldown('ai', userId, COOLDOWNS.ai, { label: 'the AI commands' });

/** The level-up announcement, used by activity and by /grow. */
export function levelUpEmbed(member, result) {
  const name = member?.displayName ?? member?.user?.username ?? 'A soul';
  return webEmbed({
    title: `${brand.emoji.bolt} Level up — ${name} reached level ${result.level}`,
    description: `${result.rank?.name ?? rankForLevel(result.level).name} • reward: ${brand.emoji.web} **${formatNumber(result.rewards?.coins ?? 0)}** coins and **${formatNumber(result.rewards?.aura ?? 0)}** aura.`,
    color: brand.colors.primary,
    thumbnail: member?.displayAvatarURL?.({ size: 128 }) ?? null,
  });
}

export function walletOf(userId) {
  return account(userId);
}

export default card;
