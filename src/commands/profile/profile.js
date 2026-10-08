import { SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { account, balanceOf } from '../../database/progression.js';
import { SHOP, CURRENCY_EMOJI, coins } from '../../services/economy.js';
import { card } from '../../services/progression.js';
import { webEmbed } from '../../utils/embeds.js';
import { formatNumber, timeAgo, truncate } from '../../utils/format.js';

/** /profile — one card with everything the web knows about a member. */

function inventoryLines(record) {
  if (!record.inventory.length) return 'Empty';
  return truncate(
    record.inventory
      .map((entry) => {
        const item = SHOP.find((candidate) => candidate.id === entry.itemId);
        return item ? `${item.emoji} ${item.name} ×${entry.quantity}` : `❓ ${entry.itemId} ×${entry.quantity}`;
      })
      .join('\n'),
    1020,
  );
}

const profile = {
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('Your full web card: level, XP, aura, rank, coins, streak and inventory')
    .addUserOption((option) => option.setName('user').setDescription('Whose profile (defaults to you)').setRequired(false)),
  async run(interaction) {
    const target = interaction.options.getUser('user') ?? interaction.user;
    const record = card(target.id);
    const wallet = account(target.id);
    const total = balanceOf(wallet);
    const remaining = record.maxed ? 0 : record.xpForNextLevel - record.xpIntoLevel;

    return interaction.reply({
      embeds: [
        webEmbed({
          title: `🕸️ ${target.username}`,
          description: `<@${target.id}> · \`${target.id}\`\n${record.rank.name}`,
          thumbnail: target.displayAvatarURL({ size: 256 }),
          color: brand.colors.primary,
          fields: [
            { name: 'Level', value: `**${record.level}** / 100`, inline: true },
            { name: 'Rank', value: record.rank.name, inline: true },
            { name: 'Aura', value: `**${formatNumber(record.aura)}**`, inline: true },
            {
              name: 'XP',
              value: `${formatNumber(record.xp)} total\n${formatNumber(record.xpIntoLevel)} / ${formatNumber(record.xpForNextLevel)} into this level`,
              inline: true,
            },
            { name: 'XP required', value: record.maxed ? 'max level' : `${formatNumber(remaining)} to level ${record.level + 1}`, inline: true },
            { name: 'Progress', value: `\`${record.bar}\``, inline: true },
            { name: 'Wallet', value: `${CURRENCY_EMOJI} ${formatNumber(wallet.wallet)}`, inline: true },
            { name: 'Bank', value: `${CURRENCY_EMOJI} ${formatNumber(wallet.bank)}`, inline: true },
            { name: 'Coins total', value: `${CURRENCY_EMOJI} **${formatNumber(total)}**`, inline: true },
            { name: 'Streak', value: `${record.streak ?? 0} day(s)`, inline: true },
            { name: 'Last daily', value: record.lastDaily ? timeAgo(record.lastDaily) : 'never', inline: true },
            { name: 'Gifts', value: `${formatNumber(record.giftsReceived ?? 0)} in · ${formatNumber(record.giftsSent ?? 0)} out`, inline: true },
            { name: `Inventory (${wallet.inventory.length})`, value: inventoryLines(wallet), inline: false },
            { name: 'Commands used', value: formatNumber(record.commandsUsed ?? 0), inline: true },
          ],
          footer: `${brand.footer} • ${coins(total)} held`,
        }),
      ],
      allowedMentions: { parse: [] },
    });
  },
};

export default [profile];
