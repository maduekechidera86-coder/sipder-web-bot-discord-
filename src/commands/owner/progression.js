import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { database } from '../../database/index.js';
import {
  MAX_AURA,
  MAX_COINS,
  MAX_XP,
  account,
  progress,
  resetAccount,
  resetProgress,
  saveAccount,
} from '../../database/progression.js';
import { CURRENCY_EMOJI, amountProblem, coins, parseAmount } from '../../services/economy.js';
import { card, setAura, setXp } from '../../services/progression.js';
import { resetScope } from '../../utils/cooldowns.js';
import { sendLog } from '../../services/logs.js';
import { errorEmbed, ownerEmbed, successEmbed } from '../../utils/embeds.js';
import { formatNumber } from '../../utils/format.js';
import { guardOwner } from '../../utils/permissions.js';

/**
 * Owner-only controls for the economy and progression systems.
 * Authorisation uses exactly the existing owner system: OWNER_ID from .env plus
 * the stored owner list, checked through database.isOwner().
 */
async function ownerOnly(interaction, action) {
  const check = guardOwner(interaction.user.id, database.isOwner(interaction.user.id), { action });
  if (!check.ok) {
    await interaction.reply({ embeds: [errorEmbed('Owner only', check.message)], flags: MessageFlags.Ephemeral });
    return false;
  }
  return true;
}

function amountFor(raw, max) {
  const parsed = parseAmount(raw, { min: 0, max });
  if (!parsed.ok) return parsed;
  return parsed;
}

async function record(interaction, title, description, fields = []) {
  await sendLog(interaction.guild, {
    type: 'owner',
    title,
    description,
    fields: [...fields, { name: 'By', value: `<@${interaction.user.id}>`, inline: true }],
  }).catch(() => null);
}

const economySet = {
  data: new SlashCommandBuilder()
    .setName('economy-set')
    .setDescription('Owner: set a member’s Web Coins to an exact amount')
    .addUserOption((option) => option.setName('user').setDescription('Whose balance').setRequired(true))
    .addStringOption((option) => option.setName('amount').setDescription('Exact amount of Web Coins').setRequired(true).setMaxLength(20))
    .addStringOption((option) =>
      option
        .setName('target')
        .setDescription('Where to put it')
        .setRequired(false)
        .addChoices(
          { name: 'Wallet', value: 'wallet' },
          { name: 'Bank', value: 'bank' },
          { name: 'Wallet + bank total', value: 'total' },
        ),
    ),
  async run(interaction) {
    if (!(await ownerOnly(interaction, 'change an economy balance'))) return undefined;

    const target = interaction.options.getUser('user');
    const where = interaction.options.getString('target') ?? 'wallet';
    const parsed = amountFor(interaction.options.getString('amount'), MAX_COINS);
    if (!parsed.ok) {
      return interaction.reply({ embeds: [errorEmbed('Invalid amount', amountProblem(parsed))], flags: MessageFlags.Ephemeral });
    }

    const current = account(target.id);
    const patch =
      where === 'wallet' ? { wallet: parsed.value }
        : where === 'bank' ? { bank: parsed.value }
          : { wallet: parsed.value, bank: 0 };
    const next = saveAccount({ ...current, ...patch });

    await record(interaction, 'Economy balance set', `<@${target.id}> → ${where} = ${coins(parsed.value)}`);

    return interaction.reply({
      embeds: [
        successEmbed('Balance set', `${target} is now holding ${coins(parsed.value)} in **${where}**.`, [
          { name: 'Wallet', value: `${CURRENCY_EMOJI} ${formatNumber(next.wallet)}`, inline: true },
          { name: 'Bank', value: `${CURRENCY_EMOJI} ${formatNumber(next.bank)}`, inline: true },
        ]),
      ],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};

const economyReset = {
  data: new SlashCommandBuilder()
    .setName('economy-reset')
    .setDescription('Owner: wipe a member’s Web Coins and inventory')
    .addUserOption((option) => option.setName('user').setDescription('Whose economy data').setRequired(true)),
  async run(interaction) {
    if (!(await ownerOnly(interaction, 'reset an economy balance'))) return undefined;

    const target = interaction.options.getUser('user');
    resetAccount(target.id);
    await record(interaction, 'Economy reset', `<@${target.id}> wallet, bank and inventory cleared`);

    return interaction.reply({
      embeds: [successEmbed('Economy reset', `${target} now has an empty wallet, bank and inventory. Level, XP and aura were kept.`)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};

const auraSet = {
  data: new SlashCommandBuilder()
    .setName('aura-set')
    .setDescription('Owner: set a member’s aura to an exact amount')
    .addUserOption((option) => option.setName('user').setDescription('Whose aura').setRequired(true))
    .addStringOption((option) => option.setName('amount').setDescription('Exact aura amount').setRequired(true).setMaxLength(20)),
  async run(interaction) {
    if (!(await ownerOnly(interaction, 'change an aura total'))) return undefined;

    const target = interaction.options.getUser('user');
    const parsed = amountFor(interaction.options.getString('amount'), MAX_AURA);
    if (!parsed.ok) {
      return interaction.reply({ embeds: [errorEmbed('Invalid amount', amountProblem(parsed))], flags: MessageFlags.Ephemeral });
    }

    setAura(target.id, parsed.value);
    await record(interaction, 'Aura set', `<@${target.id}> → ${formatNumber(parsed.value)} aura`);

    return interaction.reply({
      embeds: [successEmbed('Aura set', `${target} now holds **${formatNumber(parsed.value)}** aura.`)],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};

async function auraDelta(interaction, sign) {
  if (!(await ownerOnly(interaction, 'change an aura total'))) return undefined;

  const target = interaction.options.getUser('user');
  const parsed = amountFor(interaction.options.getString('amount'), MAX_AURA);
  if (!parsed.ok) {
    return interaction.reply({ embeds: [errorEmbed('Invalid amount', amountProblem(parsed))], flags: MessageFlags.Ephemeral });
  }

  const current = progress(target.id);
  const next = Math.max(0, Math.min(MAX_AURA, current.aura + sign * parsed.value));
  setAura(target.id, next);
  await record(interaction, sign > 0 ? 'Aura added' : 'Aura removed', `<@${target.id}> → ${formatNumber(next)} aura`);

  return interaction.reply({
    embeds: [
      successEmbed(sign > 0 ? 'Aura added' : 'Aura removed', `${target} now holds **${formatNumber(next)}** aura.`, [
        { name: 'Change', value: `${sign > 0 ? '+' : '-'}${formatNumber(parsed.value)}`, inline: true },
      ]),
    ],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

const auraAdd = {
  data: new SlashCommandBuilder()
    .setName('aura-add')
    .setDescription('Owner: add aura to a member')
    .addUserOption((option) => option.setName('user').setDescription('Who receives it').setRequired(true))
    .addStringOption((option) => option.setName('amount').setDescription('How much aura').setRequired(true).setMaxLength(20)),
  async run(interaction) {
    return auraDelta(interaction, 1);
  },
};

const auraRemove = {
  data: new SlashCommandBuilder()
    .setName('aura-remove')
    .setDescription('Owner: remove aura from a member')
    .addUserOption((option) => option.setName('user').setDescription('Who loses it').setRequired(true))
    .addStringOption((option) => option.setName('amount').setDescription('How much aura').setRequired(true).setMaxLength(20)),
  async run(interaction) {
    return auraDelta(interaction, -1);
  },
};

async function xpDelta(interaction, sign) {
  if (!(await ownerOnly(interaction, 'change an XP total'))) return undefined;

  const target = interaction.options.getUser('user');
  const parsed = amountFor(interaction.options.getString('amount'), MAX_XP);
  if (!parsed.ok) {
    return interaction.reply({ embeds: [errorEmbed('Invalid amount', amountProblem(parsed))], flags: MessageFlags.Ephemeral });
  }

  const current = progress(target.id);
  const next = Math.max(0, Math.min(MAX_XP, current.xp + sign * parsed.value));
  setXp(target.id, next);
  const after = card(target.id);

  await record(interaction, sign > 0 ? 'XP added' : 'XP removed', `<@${target.id}> → ${formatNumber(next)} XP (level ${after.level})`);

  return interaction.reply({
    embeds: [
      successEmbed(sign > 0 ? 'XP added' : 'XP removed', `${target} now has **${formatNumber(next)}** XP.`, [
        { name: 'Level', value: `${after.level} — ${after.rank.name}`, inline: true },
        { name: 'Change', value: `${sign > 0 ? '+' : '-'}${formatNumber(parsed.value)}`, inline: true },
      ]),
    ],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

const xpAdd = {
  data: new SlashCommandBuilder()
    .setName('xp-add')
    .setDescription('Owner: add XP to a member')
    .addUserOption((option) => option.setName('user').setDescription('Who gains XP').setRequired(true))
    .addStringOption((option) => option.setName('amount').setDescription('How much XP').setRequired(true).setMaxLength(20)),
  async run(interaction) {
    return xpDelta(interaction, 1);
  },
};

const xpRemove = {
  data: new SlashCommandBuilder()
    .setName('xp-remove')
    .setDescription('Owner: remove XP from a member')
    .addUserOption((option) => option.setName('user').setDescription('Who loses XP').setRequired(true))
    .addStringOption((option) => option.setName('amount').setDescription('How much XP').setRequired(true).setMaxLength(20)),
  async run(interaction) {
    return xpDelta(interaction, -1);
  },
};

const progressionReset = {
  data: new SlashCommandBuilder()
    .setName('progression-reset')
    .setDescription('Owner: reset a member’s level, XP, aura and streak')
    .addUserOption((option) => option.setName('user').setDescription('Whose progression').setRequired(true)),
  async run(interaction) {
    if (!(await ownerOnly(interaction, 'reset progression'))) return undefined;

    const target = interaction.options.getUser('user');
    resetProgress(target.id);
    const cleared = resetScope('xp') + resetScope('aura') + resetScope('grow') + resetScope('daily') + resetScope('gift');

    await record(interaction, 'Progression reset', `<@${target.id}> level, XP, aura and streak cleared (${cleared} cooldown(s) freed)`);

    return interaction.reply({
      embeds: [
        ownerEmbed('Progression reset', `${target} is back to **level 1, 0 XP, 0 aura, no streak**.`, [
          { name: 'Kept', value: 'Web Coins and inventory were not touched — use `/economy-reset` for those.', inline: false },
          { name: 'Cooldowns cleared', value: String(cleared), inline: true },
        ]),
      ],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};

export default [economySet, economyReset, auraSet, auraAdd, auraRemove, xpAdd, xpRemove, progressionReset];
