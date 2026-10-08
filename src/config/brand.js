/**
 * Single source of truth for the 🕸️ SPIDER WEB ⸸ X identity.
 * Colours are decimal integers because discord.js embeds expect integers.
 */
export const brand = {
  name: '🕸️ SPIDER WEB ⸸ X',
  short: 'SPIDER WEB X',
  owner: 'NIGHTMARE',
  tagline: 'THE WEB IS AWAKE',
  footer: '🕸️ SPIDER WEB ⸸ X • NIGHTMARE • THE WEB IS AWAKE',
  version: '1.0.0',
  emoji: {
    web: '🕸️',
    spider: '🕷️',
    crown: '👑',
    bolt: '⚡',
    moon: '🌑',
    fire: '🔥',
    shield: '🛡️',
    gear: '⚙️',
    check: '✅',
    cross: '❌',
    warn: '⚠️',
  },
  colors: {
    primary: 0xb1121f,
    dark: 0x0b0b10,
    void: 0x05050a,
    success: 0x27ae60,
    warning: 0xe0a700,
    error: 0xe02a3c,
    info: 0x8e96ad,
    silver: 0xd9d9e3,
  },
};

export const brandFooter = () => brand.footer;

/** A short one-line banner used in logs and headers. */
export const brandBanner = () => `${brand.name} — ${brand.tagline} (owner: ${brand.owner})`;
