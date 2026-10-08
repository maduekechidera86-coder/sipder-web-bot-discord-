import { formatNumber } from '../utils/format.js';

/** 🕸️ Web Coins — the one currency, formatted in one place. */
export const CURRENCY = '🕸️ Web Coins';
export const CURRENCY_EMOJI = '🕸️';

export function coins(amount) {
  return `${CURRENCY_EMOJI} ${formatNumber(amount)}`;
}

export const MAX_TRANSFER = 10_000_000;

/** The /shop catalogue. Prices, rarities and resale values are all derived from here. */
export const SHOP = [
  { id: 'web-silk', name: 'Web Silk', emoji: '🧵', price: 120, rarity: 'Common', description: 'Freshly spun thread from the back of the web.' },
  { id: 'dust-moth', name: 'Dust Moth', emoji: '🦋', price: 180, rarity: 'Common', description: 'It wandered in. It never wandered out.' },
  { id: 'cracked-fang', name: 'Cracked Fang', emoji: '🦷', price: 260, rarity: 'Common', description: 'Someone fought something bigger.' },
  { id: 'ink-vial', name: 'Void Ink', emoji: '🖤', price: 750, rarity: 'Rare', description: 'Writes in a colour that does not exist.' },
  { id: 'silver-thread', name: 'Silver Thread', emoji: '🕸️', price: 1100, rarity: 'Rare', description: 'Stronger than steel, thinner than a thought.' },
  { id: 'shadow-lens', name: 'Shadow Lens', emoji: '🔮', price: 1650, rarity: 'Rare', description: 'Shows you what is watching you back.' },
  { id: 'crawler-claw', name: 'Crawler Claw', emoji: '🗡️', price: 3200, rarity: 'Epic', description: 'Taken from a Shadow Crawler. Voluntarily? Unclear.' },
  { id: 'hunter-eye', name: 'Hunter Eye', emoji: '👁️', price: 4400, rarity: 'Epic', description: 'It still blinks when you are not looking.' },
  { id: 'night-heart', name: 'Night Heart', emoji: '💜', price: 5800, rarity: 'Epic', description: 'Beats once every full moon.' },
  { id: 'lord-sigil', name: "Web Lord's Sigil", emoji: '👑', price: 12000, rarity: 'Legendary', description: 'Proof that the web answered to you once.' },
  { id: 'king-crown', name: 'Spider King Crown', emoji: '🕷️', price: 21000, rarity: 'Legendary', description: 'Woven from the dreams of everyone who ever feared a spider.' },
  { id: 'nightmare-relic', name: 'NIGHTMARE Relic', emoji: '☠️', price: 36000, rarity: 'Mythic', description: 'The web itself signed this one.' },
];

export const SHOP_BY_ID = new Map(SHOP.map((item) => [item.id, item]));

export function findItem(query) {
  if (!query) return null;
  const needle = String(query).trim().toLowerCase();
  return (
    SHOP_BY_ID.get(needle) ??
    SHOP.find((item) => item.name.toLowerCase() === needle) ??
    SHOP.find((item) => item.name.toLowerCase().includes(needle)) ??
    SHOP.find((item) => item.id.includes(needle)) ??
    null
  );
}

/** Resale value: 60% of the shop price, rounded down. */
export function sellValue(item) {
  return Math.floor(item.price * 0.6);
}

export function itemLabel(item) {
  return `${item.emoji} **${item.name}**`;
}

/** Amounts come from Discord as text — this is the single validator. */
export function parseAmount(raw, { min = 1, max = MAX_TRANSFER } = {}) {
  if (raw === null || raw === undefined || raw === '') return { ok: false, reason: 'missing' };
  const text = String(raw).trim().toLowerCase().replace(/[,_\s]/g, '');
  if (!/^\d+$/.test(text)) return { ok: false, reason: 'not_a_number' };

  const value = Number(text);
  if (!Number.isSafeInteger(value)) return { ok: false, reason: 'not_safe' };
  if (value < min) return { ok: false, reason: 'too_small', min };
  if (value > max) return { ok: false, reason: 'too_large', max };
  return { ok: true, value };
}

export function amountProblem(result) {
  switch (result.reason) {
    case 'missing':
      return 'Give me an amount, for example `250`.';
    case 'not_a_number':
      return 'That is not an amount — use whole numbers only, for example `250`.';
    case 'not_safe':
      return 'That number is far too large.';
    case 'too_small':
      return `The smallest allowed amount is **${formatNumber(result.min)}**.`;
    case 'too_large':
      return `The largest allowed amount is **${formatNumber(result.max)}**.`;
    default:
      return 'That amount is not valid.';
  }
}

export default SHOP;
