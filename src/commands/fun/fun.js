import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { checkFun, markFun } from '../../services/progression.js';
import { registerComponent } from '../../utils/components.js';
import { errorEmbed, webEmbed } from '../../utils/embeds.js';
import { coinEmbed, diceEmbed, eightBallEmbed } from './games.js';
import { JOKES, pickRandom } from './content.js';

/**
 * /fun — the interactive hub.
 *
 * The four category buttons rewrite the panel in place, and the four quick
 * buttons really play (they call the same helpers the slash commands use).
 */
const PANEL_PREFIX = 'web:fun';

const PANELS = {
  games: {
    label: 'Games',
    emoji: '🎮',
    lines: [
      '`/8ball` — ask the web a question',
      '`/coinflip` — heads or tails',
      '`/dice` — roll up to 10 dice',
      '`/rps` — rock, paper, scissors',
      '`/choose` — let the web decide for you',
      '`/rate` — rate anything out of 100',
      '`/ship` — web-match two souls',
    ],
    tip: 'Games post in the channel so everyone can watch.',
  },
  chaos: {
    label: 'Chaos',
    emoji: '🔥',
    lines: [
      '`/roast` — burn someone, kindly',
      '`/truth` — the truth, unprompted',
      '`/dare` — accept the dare',
      '`/8ball` — a chaotic prophecy',
    ],
    tip: 'Everything here is server-safe.',
  },
  wisdom: {
    label: 'Wisdom',
    emoji: '🧠',
    lines: [
      '`/quote` — a line worth remembering',
      '`/compliment` — make someone smile',
      '`/joke` — laugh at the dark',
      '`/explain` — the AI explains anything',
    ],
    tip: 'Wisdom keeps a 6 second cooldown per member.',
  },
  web: {
    label: 'The Web',
    emoji: '🕸️',
    lines: [
      '`/profile` — your full web card',
      '`/rank` — level, XP and rank',
      '`/aura` — your aura total',
      '`/balance` — 🕸️ Web Coins',
      '`/daily` — collect your daily coins',
      '`/meme` — render a meme right now',
    ],
    tip: 'The web remembers everything you earn.',
  },
};

function panelEmbed(key) {
  const panel = PANELS[key] ?? PANELS.games;
  return webEmbed({
    title: `${panel.emoji} ${brand.name} — ${panel.label}`,
    description: `**${brand.tagline}**\n\n${panel.lines.join('\n')}`,
    fields: [{ name: `${brand.emoji.gear} Tip`, value: panel.tip, inline: false }],
    color: brand.colors.primary,
  });
}

function panelRows(active = 'games') {
  const categories = new ActionRowBuilder().addComponents(
    Object.entries(PANELS).map(([key, panel]) =>
      new ButtonBuilder()
        .setCustomId(`${PANEL_PREFIX}:panel:${key}`)
        .setLabel(panel.label)
        .setEmoji(panel.emoji)
        .setStyle(key === active ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
  );

  const plays = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:play:dice`).setLabel('Roll dice').setEmoji('🎲').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:play:coin`).setLabel('Flip coin').setEmoji('🪙').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:play:8ball`).setLabel('8-ball').setEmoji('🎱').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:play:joke`).setLabel('Joke').setEmoji('😂').setStyle(ButtonStyle.Success),
  );

  return [categories, plays];
}

async function handleFunComponent(interaction) {
  const [, , kind, value] = (interaction.customId ?? '').split(':');

  if (kind === 'panel') {
    const key = PANELS[value] ? value : 'games';
    return interaction.update({ embeds: [panelEmbed(key)], components: panelRows(key) });
  }

  if (kind === 'play') {
    const check = checkFun(interaction.user.id, 'the quick buttons');
    if (!check.ok) return interaction.reply({ embeds: [errorEmbed('Cooldown', check.message)], flags: MessageFlags.Ephemeral });
    markFun(interaction.user.id);

    if (value === 'dice') return interaction.reply({ embeds: [diceEmbed(2, 6)] });
    if (value === 'coin') return interaction.reply({ embeds: [coinEmbed()] });
    if (value === '8ball') return interaction.reply({ embeds: [eightBallEmbed(null)] });
    if (value === 'joke') return interaction.reply({ embeds: [webEmbed({ title: '😂 Joke', description: pickRandom(JOKES) })] });
  }

  return interaction.reply({ content: 'That button is out of date — run `/fun` again.', flags: MessageFlags.Ephemeral });
}

registerComponent(PANEL_PREFIX, handleFunComponent);

const fun = {
  data: new SlashCommandBuilder()
    .setName('fun')
    .setDescription('The 🕸️ fun hub — games, chaos and wisdom, all in one panel')
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('Open a specific tab straight away')
        .setRequired(false)
        .addChoices(
          { name: 'Games', value: 'games' },
          { name: 'Chaos', value: 'chaos' },
          { name: 'Wisdom', value: 'wisdom' },
          { name: 'The Web', value: 'web' },
        ),
    ),
  async run(interaction) {
    const category = interaction.options.getString('category') ?? 'games';
    return interaction.reply({ embeds: [panelEmbed(category)], components: panelRows(category) });
  },
};

export default [fun];
