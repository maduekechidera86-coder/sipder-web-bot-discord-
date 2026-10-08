import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { checkFun, markFun } from '../../services/progression.js';
import { errorEmbed, webEmbed } from '../../utils/embeds.js';
import { truncate } from '../../utils/format.js';

/** Games are pure logic — no API needed, so they always work. */

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
export const pickRandom = (list) => list[randomInt(0, list.length - 1)];

const EIGHT_BALL = [
  '🕸️ The web says yes.',
  '🕸️ The web says no.',
  '🕷️ Absolutely — and you already knew that.',
  '🌑 Not today. Ask again when the moon shifts.',
  '⚡ Yes, but not the way you expect.',
  '❌ No. And stop poking the web.',
  '🔥 Yes — with consequences.',
  '👑 Only if you earn it.',
  '☠️ The web refuses to answer that.',
  '🎲 Unclear. Roll something.',
  '💀 Ask someone who survived it.',
  '🕸️ The answer is tangled. Try a different question.',
  '⚡ Very likely.',
  '🌑 Very unlikely.',
  '🔥 It depends on who is watching.',
  '🕷️ The web is silent on purpose.',
  '👑 Yes — if you keep your word.',
  '💀 No — and the web is not sorry.',
  '🎲 Fifty-fifty, but worse.',
  '🕸️ Definitely. Move before it changes its mind.',
];

const RPS = {
  rock: { emoji: '🪨', beats: 'scissors' },
  paper: { emoji: '📄', beats: 'rock' },
  scissors: { emoji: '✂️', beats: 'paper' },
};

const RPS_KEYS = Object.keys(RPS);

const JOBS = [
  ['spun silk for the web', 90],
  ['cleaned the corpses out of the trap', 120],
  ['guarded the gate at 3am', 150],
  ['sorted the archives of NIGHTMARE', 130],
  ['chased a moth out of the server', 80],
  ['tuned the web vibrations', 175],
  ['counted every strand in the east wall', 110],
  ['talked a lost soul back to the entrance', 160],
  ['collected debts from the shadows', 200],
  ['rewove a broken corner of the net', 145],
];

function hash(text) {
  let value = 7;
  for (const char of String(text)) value = (value * 31 + char.charCodeAt(0)) % 10_000_019;
  return value;
}

export function rollDice(times = 1, sides = 6) {
  const rolls = [];
  for (let index = 0; index < times; index += 1) rolls.push(randomInt(1, sides));
  return { rolls, total: rolls.reduce((sum, value) => sum + value, 0) };
}

export function diceEmbed(times = 2, sides = 6) {
  const { rolls, total } = rollDice(times, sides);
  return webEmbed({
    title: '🎲 Dice rolled',
    description: `**${rolls.join(' + ')} = ${total}**`,
    fields: [
      { name: 'Dice', value: `${times}d${sides}`, inline: true },
      { name: 'Total', value: String(total), inline: true },
    ],
    color: brand.colors.primary,
  });
}

export function flipCoin() {
  return Math.random() < 0.5 ? 'heads' : 'tails';
}

export function coinEmbed() {
  const result = flipCoin();
  return webEmbed({
    title: '🪙 Coin flipped',
    description: `It landed on **${result}**${result === 'heads' ? ' 🕸️' : ' 🌑'}.`,
    color: result === 'heads' ? brand.colors.primary : brand.colors.info,
  });
}

export function eightBallEmbed(question = null) {
  return webEmbed({
    title: '🎱 The web answers',
    description: question ? `> ${truncate(question, 300)}\n\n${pickRandom(EIGHT_BALL)}` : pickRandom(EIGHT_BALL),
    color: brand.colors.primary,
  });
}

export function rpsEmbed(choice) {
  const player = RPS[choice];
  const botKey = pickRandom(RPS_KEYS);
  const bot = RPS[botKey];

  const outcome = player.beats === botKey ? 'win' : bot.beats === choice ? 'lose' : 'tie';
  const text = { win: '🕸️ You beat the web.', lose: '💀 The web beat you.', tie: '🌑 Dead even.' }[outcome];
  const color = { win: brand.colors.success, lose: brand.colors.error, tie: brand.colors.info }[outcome];

  return webEmbed({
    title: '✂️ Rock · Paper · Scissors',
    description: `${player.emoji} **${choice}** vs ${bot.emoji} **${botKey}**\n\n${text}`,
    color,
  });
}

export function chooseEmbed(input) {
  const options = String(input)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const chosen = pickRandom(options);
  return webEmbed({
    title: '🕸️ The web decided',
    description: `> **${chosen}**`,
    fields: [{ name: 'Out of', value: truncate(options.map((item) => `• ${item}`).join('\n'), 1020), inline: false }],
    color: brand.colors.primary,
  });
}

export function rateEmbed(thing) {
  const score = hash(String(thing).toLowerCase()) % 101;
  const tiers = [
    [90, '☠️ Legendary — the web itself is jealous.'],
    [75, '👑 Excellent.'],
    [55, '⚡ Solid.'],
    [35, '🕸️ Middle of the web.'],
    [15, '🌑 Rough.'],
    [0, '💀 The web has seen better.'],
  ];
  const tier = tiers.find(([minimum]) => score >= minimum)[1];

  return webEmbed({
    title: '📊 Rated',
    description: `**${truncate(thing, 300)}**\n\n**${score}/100** — ${tier}`,
    color: brand.colors.primary,
  });
}

export function shipEmbed(first, second) {
  const names = [first.username, second.username].map((name) => name.toLowerCase()).sort();
  const score = hash(names.join('+')) % 101;
  const label =
    score >= 85 ? '☠️ NIGHTMARE MATCH — the web tied the knot itself.'
      : score >= 65 ? '👑 Strong match.'
        : score >= 45 ? '⚡ Worth a try.'
          : score >= 25 ? '🕸️ Tangled, but possible.'
            : '🌑 The web is not feeling it.';
  const filled = Math.round(score / 10);

  return webEmbed({
    title: '🕸️ Web match',
    description: `${first} × ${second}\n\n\`${'▰'.repeat(filled)}${'▱'.repeat(10 - filled)}\` **${score}%**\n${label}`,
    color: brand.colors.primary,
  });
}

function blocked(interaction, check) {
  return interaction.reply({ embeds: [errorEmbed('Cooldown', check.message)], flags: MessageFlags.Ephemeral });
}

function guard(interaction, label, ms = 6000) {
  const check = checkFun(interaction.user.id, label, ms);
  if (!check.ok) return check;
  markFun(interaction.user.id);
  return check;
}

const eightball = {
  data: new SlashCommandBuilder()
    .setName('8ball')
    .setDescription('Ask the web a question and get its answer')
    .addStringOption((option) => option.setName('question').setDescription('What do you want to ask?').setRequired(true).setMaxLength(300)),
  async run(interaction) {
    const check = guard(interaction, '/8ball');
    if (!check.ok) return blocked(interaction, check);
    return interaction.reply({ embeds: [eightBallEmbed(interaction.options.getString('question'))] });
  },
};

const coinflip = {
  data: new SlashCommandBuilder().setName('coinflip').setDescription('Flip a 🕸️ coin'),
  async run(interaction) {
    const check = guard(interaction, '/coinflip');
    if (!check.ok) return blocked(interaction, check);
    return interaction.reply({ embeds: [coinEmbed()] });
  },
};

const dice = {
  data: new SlashCommandBuilder()
    .setName('dice')
    .setDescription('Roll dice')
    .addIntegerOption((option) => option.setName('count').setDescription('How many dice (1-10)').setRequired(false).setMinValue(1).setMaxValue(10))
    .addIntegerOption((option) =>
      option
        .setName('sides')
        .setDescription('How many sides')
        .setRequired(false)
        .addChoices(
          { name: '4', value: 4 },
          { name: '6', value: 6 },
          { name: '8', value: 8 },
          { name: '10', value: 10 },
          { name: '12', value: 12 },
          { name: '20', value: 20 },
          { name: '100', value: 100 },
        ),
    ),
  async run(interaction) {
    const check = guard(interaction, '/dice');
    if (!check.ok) return blocked(interaction, check);
    return interaction.reply({ embeds: [diceEmbed(interaction.options.getInteger('count') ?? 1, interaction.options.getInteger('sides') ?? 6)] });
  },
};

const rps = {
  data: new SlashCommandBuilder()
    .setName('rps')
    .setDescription('Rock, paper, scissors against the web')
    .addStringOption((option) =>
      option
        .setName('choice')
        .setDescription('Your move')
        .setRequired(true)
        .addChoices(
          { name: '🪨 Rock', value: 'rock' },
          { name: '📄 Paper', value: 'paper' },
          { name: '✂️ Scissors', value: 'scissors' },
        ),
    ),
  async run(interaction) {
    const check = guard(interaction, '/rps');
    if (!check.ok) return blocked(interaction, check);
    return interaction.reply({ embeds: [rpsEmbed(interaction.options.getString('choice'))] });
  },
};

const choose = {
  data: new SlashCommandBuilder()
    .setName('choose')
    .setDescription('Let the web choose between your options')
    .addStringOption((option) =>
      option.setName('options').setDescription('Separate them with commas: pizza, sushi, noodles').setRequired(true).setMaxLength(600),
    ),
  async run(interaction) {
    const check = guard(interaction, '/choose');
    if (!check.ok) return blocked(interaction, check);
    const raw = interaction.options.getString('options');
    const count = raw.split(',').map((item) => item.trim()).filter(Boolean).length;
    if (count < 2) {
      return interaction.reply({ embeds: [errorEmbed('Not enough options', 'Give me at least two, separated by commas.')], flags: MessageFlags.Ephemeral });
    }
    return interaction.reply({ embeds: [chooseEmbed(raw)] });
  },
};

const rate = {
  data: new SlashCommandBuilder()
    .setName('rate')
    .setDescription('Rate anything out of 100')
    .addStringOption((option) => option.setName('thing').setDescription('What should I rate?').setRequired(true).setMaxLength(300)),
  async run(interaction) {
    const check = guard(interaction, '/rate');
    if (!check.ok) return blocked(interaction, check);
    return interaction.reply({ embeds: [rateEmbed(interaction.options.getString('thing'))] });
  },
};

const ship = {
  data: new SlashCommandBuilder()
    .setName('ship')
    .setDescription('Web-match two members')
    .addUserOption((option) => option.setName('first').setDescription('First member').setRequired(true))
    .addUserOption((option) => option.setName('second').setDescription('Second member').setRequired(true)),
  async run(interaction) {
    const first = interaction.options.getUser('first');
    const second = interaction.options.getUser('second');
    if (first.id === second.id) {
      return interaction.reply({ embeds: [errorEmbed('Same soul', 'Shipping someone with themselves is a different kind of problem.')], flags: MessageFlags.Ephemeral });
    }
    const check = guard(interaction, '/ship');
    if (!check.ok) return blocked(interaction, check);
    return interaction.reply({ embeds: [shipEmbed(first, second)] });
  },
};

export default [eightball, coinflip, dice, rps, choose, rate, ship];
