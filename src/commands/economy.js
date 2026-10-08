import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { account, addCoins, addItem, balanceOf, itemCount, moveCoins, progress, removeItem, saveProgress, takeCoins, transferCoins } from '../database/progression.js';
import { CURRENCY, CURRENCY_EMOJI, MAX_TRANSFER, SHOP, amountProblem, coins, findItem, itemLabel, sellValue } from '../services/economy.js';
import { card, dailyCooldown, markDaily, markWork, workCooldown } from '../services/progression.js';
import { checkCooldown, markUsed } from '../utils/cooldowns.js';
import { errorEmbed, infoEmbed, successEmbed, warningEmbed } from '../utils/embeds.js';
import { guardTarget } from '../utils/permissions.js';
import { formatDuration, formatNumber, truncate } from '../utils/format.js';

const TRANSFER_COOLDOWN_MS = 15_000;
const DAILY_BASE = 200;
const DAILY_STREAK_BONUS = 25;
const DAILY_STREAK_CAP = 30;
const WORK_MIN = 80;
const WORK_MAX = 320;
const WORK_CRIT = 0.12;
const MAX_PER_ORDER = 25;

const JOBS = [
  ['spun silk for the web', 1.0],
  ['cleaned the corpses out of the trap', 1.1],
  ['guarded the gate at 3am', 1.2],
  ['sorted the archives of NIGHTMARE', 1.05],
  ['chased a moth out of the server', 0.9],
  ['tuned the web vibrations', 1.15],
  ['counted every strand in the east wall', 1.0],
  ['talked a lost soul back to the entrance', 1.2],
  ['collected debts from the shadows', 1.3],
  ['rewove a broken corner of the net', 1.1],
];

function shopList() {
  const byRarity = new Map();

  for (const item of SHOP) {
    if (!byRarity.has(item.rarity)) byRarity.set(item.rarity, []);
    byRarity.get(item.rarity).push(item);
  }

  return [...byRarity.entries()].map(([rarity, items]) => ({
    name: `${rarity} (${items.length})`,
    value: truncate(
      items.map((item) => `${item.emoji} **${item.name}** — ${coins(item.price)}`).join('\n'),
      1020,
    ),
    inline: false,
  }));
}

async function transfer(interaction) {
  const target = interaction.options.getUser('user');
  const raw = interaction.options.getString('amount');
  const senderId = interaction.user.id;

  if (target.id === senderId) {
    return interaction.reply({
      embeds: [errorEmbed('That is you', 'You cannot transfer coins to yourself.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (target.bot) {
    return interaction.reply({
      embeds: [errorEmbed('That is a bot', 'Bots have no wallet.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const check = checkCooldown('transfer', senderId, TRANSFER_COOLDOWN_MS, { label: 'transfers' });

  if (!check.ok) {
    return interaction.reply({
      embeds: [warningEmbed('Slow down', check.message)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const parsed = requireAmount(raw);

  if (!parsed.ok) {
    return interaction.reply({
      embeds: [errorEmbed('Invalid amount', amountProblem(parsed))],
      flags: MessageFlags.Ephemeral,
    });
  }

  if (interaction.guild) {
    const guard = await guardTarget(interaction, target.id, {
      allowSelf: false,
      allowBots: false,
      action: 'pay',
    });

    if (!guard.ok && !/not in this server/.test(guard.message)) {
      return interaction.reply({
        embeds: [errorEmbed('Blocked', guard.message)],
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  const result = transferCoins(senderId, target.id, parsed.value);

  if (!result.ok) {
    const messages = {
      insufficient: 'Your wallet does not hold that much.',
      cap_reached: 'Their wallet is at the ceiling.',
      self: 'You cannot transfer coins to yourself.',
      invalid_amount: 'That amount is not valid.',
    };

    return interaction.reply({
      embeds: [errorEmbed('Transfer refused', messages[result.reason] ?? 'That transfer is not valid.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  markUsed('transfer', senderId);

  const note = interaction.options.getString('note');
  const sender = account(senderId);

  return interaction.reply({
    embeds: [
      successEmbed('Transfer sent', `${CURRENCY_EMOJI} **${formatNumber(parsed.value)}** moved to ${target}.`, [
        { name: 'Your wallet', value: `${CURRENCY_EMOJI} ${formatNumber(sender.wallet)}`, inline: true },
        { name: 'Their wallet', value: `${CURRENCY_EMOJI} ${formatNumber(result.account.wallet)}`, inline: true },
        ...(note ? [{ name: 'Note', value: truncate(note, 500), inline: false }] : []),
      ]),
    ],
    allowedMentions: { parse: [] },
  });
}

function requireAmount(raw) {
  return raw?.trim().toLowerCase() === 'all'
    ? { ok: true, value: null }
    : parseAmount(raw, { min: 1, max: MAX_TRANSFER });
}

async function move(interaction) {
  const direction = interaction.options.getString('action');
  const raw = interaction.options.getString('amount');
  const id = interaction.user.id;
  const record = account(id);

  let value;

  if (raw.trim().toLowerCase() === 'all') {
    value = direction === 'deposit' ? record.wallet : record.bank;
  } else {
    const parsed = parseAmount(raw, { min: 1, max: MAX_TRANSFER });

    if (!parsed.ok) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid amount', amountProblem(parsed))],
        flags: MessageFlags.Ephemeral,
      });
    }

    value = parsed.value;
  }

  if (value <= 0) {
    return interaction.reply({
      embeds: [errorEmbed('Nothing to move', direction === 'deposit' ? 'Your wallet is empty.' : 'Your bank is empty.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  const result = moveCoins(id, value, direction === 'deposit' ? 'in' : 'out');

  if (!result.ok) {
    const messages = {
      insufficient_wallet: 'Your wallet does not hold that much.',
      insufficient_bank: 'Your bank does not hold that much.',
      invalid_amount: 'That amount is not valid.',
    };

    return interaction.reply({
      embeds: [errorEmbed('Cannot move that', messages[result.reason] ?? 'Something about that amount did not add up.')],
      flags: MessageFlags.Ephemeral,
    });
  }

  return interaction.reply({
    embeds: [
      successEmbed(direction === 'deposit' ? 'Deposited' : 'Withdrawn', `${CURRENCY_EMOJI} **${formatNumber(value)}** moved.`, [
        { name: 'Wallet', value: `${CURRENCY_EMOJI} ${formatNumber(result.account.wallet)}`, inline: true },
        { name: 'Bank', value: `${CURRENCY_EMOJI} ${formatNumber(result.account.bank)}`, inline: true },
      ]),
    ],
  });
}

const economy = {
  data: new SlashCommandBuilder()
    .setName('economy')
    .setDescription('🕸️ Economy, Web Coins and the shop')

    .addSubcommand((s) =>
      s.setName('balance')
        .setDescription('Check a wallet and bank balance')
        .addUserOption((o) => o.setName('user').setDescription('Whose balance')),
    )

    .addSubcommand((s) =>
      s.setName('daily')
        .setDescription('Collect your daily Web Coins'),
    )

    .addSubcommand((s) =>
      s.setName('work')
        .setDescription('Work for random Web Coins'),
    )

    .addSubcommand((s) =>
      s.setName('bank')
        .setDescription('Deposit or withdraw Web Coins')
        .addStringOption((o) =>
          o.setName('action')
            .setDescription('Bank action')
            .setRequired(true)
            .addChoices(
              { name: 'Deposit', value: 'deposit' },
              { name: 'Withdraw', value: 'withdraw' },
            ),
        )
        .addStringOption((o) =>
          o.setName('amount')
            .setDescription('Amount or "all"')
            .setRequired(true)
            .setMaxLength(20),
        ),
    )

    .addSubcommand((s) =>
      s.setName('transfer')
        .setDescription('Send Web Coins to another member')
        .addUserOption((o) => o.setName('user').setDescription('Recipient').setRequired(true))
        .addStringOption((o) => o.setName('amount').setDescription('Amount').setRequired(true).setMaxLength(20))
        .addStringOption((o) => o.setName('note').setDescription('Optional note').setMaxLength(200)),
    )

    .addSubcommand((s) =>
      s.setName('shop')
        .setDescription('Browse the Web Shop'),
    )

    .addSubcommand((s) =>
      s.setName('buy')
        .setDescription('Buy an item')
        .addStringOption((o) => o.setName('item').setDescription('Item name or ID').setRequired(true).setMaxLength(60))
        .addIntegerOption((o) => o.setName('quantity').setDescription('Quantity').setMinValue(1).setMaxValue(MAX_PER_ORDER)),
    )

    .addSubcommand((s) =>
      s.setName('sell')
        .setDescription('Sell an item')
        .addStringOption((o) => o.setName('item').setDescription('Item name or ID').setRequired(true).setMaxLength(60))
        .addIntegerOption((o) => o.setName('quantity').setDescription('Quantity').setMinValue(1).setMaxValue(MAX_PER_ORDER)),
    )

    .addSubcommand((s) =>
      s.setName('inventory')
        .setDescription('View an inventory')
        .addUserOption((o) => o.setName('user').setDescription('Whose inventory')),
    ),

  async run(interaction) {
    const sub = interaction.options.getSubcommand();
    const id = interaction.user.id;

    if (sub === 'balance') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const record = account(target.id);

      return interaction.reply({
        embeds: [
          infoEmbed(`${target.username} — ${CURRENCY}`, null, [
            { name: 'Wallet', value: `${CURRENCY_EMOJI} ${formatNumber(record.wallet)}`, inline: true },
            { name: 'Bank', value: `${CURRENCY_EMOJI} ${formatNumber(record.bank)}`, inline: true },
            { name: 'Total', value: `${CURRENCY_EMOJI} **${formatNumber(balanceOf(record))}**`, inline: true },
            { name: 'Earned all time', value: `${CURRENCY_EMOJI} ${formatNumber(record.totalEarned ?? 0)}`, inline: true },
            { name: 'Spent all time', value: `${CURRENCY_EMOJI} ${formatNumber(record.totalSpent ?? 0)}`, inline: true },
            { name: 'Inventory', value: `${record.inventory.length} item type(s)`, inline: true },
          ]),
        ],
        allowedMentions: { parse: [] },
      });
    }

    if (sub === 'daily') {
      const left = dailyCooldown(id);

      if (left > 0) {
        return interaction.reply({
          embeds: [warningEmbed('Already collected', `The web pays once a day. Come back in **${formatDuration(left)}**.`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      const record = progress(id);
      const sameStreak = record.lastDaily && Date.now() - record.lastDaily <= 48 * 3_600_000;
      const streak = sameStreak ? (record.streak ?? 0) + 1 : 1;
      const bonus = Math.min(streak, DAILY_STREAK_CAP) * DAILY_STREAK_BONUS;
      const payout = DAILY_BASE + bonus;

      markDaily(id);
      const saved = { ...record, streak, lastDaily: Date.now() };

      saveProgress(saved);

      const result = addCoins(id, payout, { reason: 'daily' });

      if (!result.ok) {
        return interaction.reply({
          embeds: [errorEmbed('The vault is full', 'Your wallet has hit the ceiling — spend something first.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply({
        embeds: [
          successEmbed('Daily collected', `${CURRENCY_EMOJI} **+${formatNumber(payout)}** Web Coins`, [
            { name: 'Base', value: coins(DAILY_BASE), inline: true },
            { name: 'Streak bonus', value: `+${coins(bonus)} (day ${streak})`, inline: true },
            { name: 'Wallet', value: coins(account(id).wallet), inline: true },
            { name: 'Level', value: `**${card(id).level}** — ${card(id).rank.name}`, inline: true },
            { name: 'Streak', value: `${streak} day${streak === 1 ? '' : 's'} — keep it alive within 48 hours.`, inline: false },
          ]),
        ],
      });
    }

    if (sub === 'work') {
      const left = workCooldown(id);

      if (left > 0) {
        return interaction.reply({
          embeds: [warningEmbed('Still working', `You are already on a job. You can work again in **${formatDuration(left)}**.`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      const [job, multiplier] = JOBS[Math.floor(Math.random() * JOBS.length)];
      const base = WORK_MIN + Math.floor(Math.random() * (WORK_MAX - WORK_MIN + 1));
      const crit = Math.random() < WORK_CRIT;
      const payout = Math.round(base * multiplier * (crit ? 2 : 1));

      markWork(id);

      const result = addCoins(id, payout, { reason: 'work' });

      if (!result.ok) {
        return interaction.reply({
          embeds: [errorEmbed('Nothing added', 'Your wallet is at the ceiling.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      return interaction.reply({
        embeds: [
          successEmbed('Shift finished', `You ${job}.`, [
            { name: 'Earned', value: `${CURRENCY_EMOJI} **+${formatNumber(payout)}**`, inline: true },
            { name: 'Multiplier', value: `×${multiplier}${crit ? ' 🔥 critical' : ''}`, inline: true },
            { name: 'Wallet', value: coins(account(id).wallet), inline: true },
            { name: 'Next shift', value: 'in 1 hour', inline: true },
          ]),
        ],
        allowedMentions: { parse: [] },
      });
    }

    if (sub === 'bank') {
      return move(interaction);
    }

    if (sub === 'transfer') {
      return transfer(interaction);
    }

    if (sub === 'shop') {
      const record = account(id);

      return interaction.reply({
        embeds: [
          infoEmbed(
            '🕸️ The Web Shop',
            `Everything is paid for from your **wallet**.\nYour wallet: ${coins(record.wallet)}`,
            shopList(),
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (sub === 'buy') {
      const item = findItem(interaction.options.getString('item'));

      if (!item) {
        return interaction.reply({
          embeds: [errorEmbed('No such item', 'Run `/economy shop` for the catalogue.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const quantity = interaction.options.getInteger('quantity') ?? 1;
      const total = item.price * quantity;
      const record = account(id);

      if (record.wallet < total) {
        return interaction.reply({
          embeds: [
            errorEmbed('Not enough Web Coins', `You need ${coins(total)} but your wallet holds ${coins(record.wallet)}.`, [
              { name: 'Short by', value: coins(total - record.wallet), inline: true },
              { name: 'Tip', value: '`/economy bank` → Deposit/Withdraw', inline: true },
            ]),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const paid = takeCoins(id, total, { reason: `buy:${item.id}` });

      if (!paid.ok) {
        return interaction.reply({
          embeds: [errorEmbed('Purchase failed', 'The payment could not be completed.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      addItem(id, item.id, quantity);

      return interaction.reply({
        embeds: [
          successEmbed('Purchase complete', `${itemLabel(item)} × **${quantity}**`, [
            { name: 'Paid', value: `${CURRENCY_EMOJI} ${formatNumber(total)}`, inline: true },
            { name: 'Wallet left', value: `${CURRENCY_EMOJI} ${formatNumber(paid.account.wallet)}`, inline: true },
            { name: 'Now owned', value: String(itemCount(id, item.id)), inline: true },
          ]),
        ],
      });
    }

    if (sub === 'sell') {
      const item = findItem(interaction.options.getString('item'));

      if (!item) {
        return interaction.reply({
          embeds: [errorEmbed('No such item', 'That is not one of mine.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const quantity = interaction.options.getInteger('quantity') ?? 1;
      const owned = itemCount(id, item.id);

      if (owned < quantity) {
        return interaction.reply({
          embeds: [errorEmbed('You do not own that many', `You hold **${owned}** × ${itemLabel(item)}.`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      const removed = removeItem(id, item.id, quantity);

      if (!removed.ok) {
        return interaction.reply({
          embeds: [errorEmbed('Sale failed', 'Your inventory did not change.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const payout = sellValue(item) * quantity;
      const credited = addCoins(id, payout, { reason: `sell:${item.id}` });

      return interaction.reply({
        embeds: [
          successEmbed('Sold', `${itemLabel(item)} × **${quantity}**`, [
            { name: 'Received', value: `${CURRENCY_EMOJI} ${formatNumber(credited.added ?? payout)}`, inline: true },
            { name: 'Wallet', value: `${CURRENCY_EMOJI} ${formatNumber(account(id).wallet)}`, inline: true },
            { name: 'Remaining', value: String(itemCount(id, item.id)), inline: true },
          ]),
        ],
      });
    }

    if (sub === 'inventory') {
      const target = interaction.options.getUser('user') ?? interaction.user;
      const record = account(target.id);

      if (!record.inventory.length) {
        return interaction.reply({
          embeds: [infoEmbed(`${target.username} — inventory`, 'Empty. `/economy shop` is where the collecting starts.')],
          allowedMentions: { parse: [] },
        });
      }

      const lines = record.inventory.map((entry) => {
        const item = SHOP.find((candidate) => candidate.id === entry.itemId);

        return item
          ? `${item.emoji} **${item.name}** × ${entry.quantity} — ${item.rarity} · sells for ${coins(sellValue(item))}`
          : `❓ \`${entry.itemId}\` × ${entry.quantity}`;
      }).join('\n');

      const value = record.inventory.reduce((sum, entry) => {
        const item = SHOP.find((candidate) => candidate.id === entry.itemId);
        return sum + (item ? sellValue(item) * entry.quantity : 0);
      }, 0);

      return interaction.reply({
        embeds: [
          infoEmbed(`${target.username} — inventory`, truncate(lines, 3000), [
            { name: 'Resale value', value: `${CURRENCY_EMOJI} ${formatNumber(value)}`, inline: true },
            { name: 'Wallet', value: `${CURRENCY_EMOJI} ${formatNumber(record.wallet)}`, inline: true },
          ]),
        ],
        allowedMentions: { parse: [] },
      });
    }

    return interaction.reply({
      embeds: [errorEmbed('Unknown economy command', 'Choose one of the `/economy` subcommands.')],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default economy;
