import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { MAX_AURA, progress, saveProgress } from '../../database/progression.js';
import { COOLDOWNS, awardAura, awardXp, card, growCooldown, levelUpEmbed, markGrow } from '../../services/progression.js';
import { checkCooldown, markUsed } from '../../utils/cooldowns.js';
import { errorEmbed, successEmbed, warningEmbed, webEmbed } from '../../utils/embeds.js';
import { formatDuration, formatNumber } from '../../utils/format.js';

/** /grow — the big progression tick. /gift — hand aura to another soul. */

const GROW_XP = { min: 40, max: 90 };
const GROW_AURA = { min: 8, max: 20 };
const GIFT_MIN = 10;
const GIFT_MAX = 1000;

const grow = {
  data: new SlashCommandBuilder().setName('grow').setDescription(`Crawl deeper into the web for XP and aura (every ${Math.round(COOLDOWNS.grow / 3_600_000)} hours)`),
  async run(interaction) {
    const id = interaction.user.id;
    const left = growCooldown(id);

    if (left > 0) {
      return interaction.reply({
        embeds: [warningEmbed('Still growing', `Your next growth is ready in **${formatDuration(left)}**.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const xpGain = GROW_XP.min + Math.floor(Math.random() * (GROW_XP.max - GROW_XP.min + 1));
    const auraGain = GROW_AURA.min + Math.floor(Math.random() * (GROW_AURA.max - GROW_AURA.min + 1));

    const xpResult = awardXp(id, xpGain, { source: 'grow' });
    awardAura(id, auraGain, { source: 'grow' });
    markGrow(id);

    const record = card(id);
    await interaction.reply({
      embeds: [
        successEmbed('You grew', `The web tightened around you.`, [
          { name: 'XP gained', value: `**+${formatNumber(xpGain)}**`, inline: true },
          { name: 'Aura gained', value: `**+${formatNumber(auraGain)}**`, inline: true },
          { name: 'Level', value: `${record.level} — ${record.rank.name}`, inline: true },
          { name: 'Next growth', value: `in ${formatDuration(COOLDOWNS.grow)}`, inline: true },
        ]),
      ],
    });

    if (xpResult.leveled) {
      await interaction.followUp({ embeds: [levelUpEmbed(interaction.member ?? interaction.user, xpResult)] });
    }
    return true;
  },
};

const gift = {
  data: new SlashCommandBuilder()
    .setName('gift')
    .setDescription(`Hand aura to another soul (${GIFT_MIN}-${GIFT_MAX} per gift)`)
    .addUserOption((option) => option.setName('user').setDescription('Who receives the aura').setRequired(true))
    .addIntegerOption((option) => option.setName('amount').setDescription(`How much aura (${GIFT_MIN}-${GIFT_MAX})`).setRequired(true).setMinValue(GIFT_MIN).setMaxValue(GIFT_MAX)),
  async run(interaction) {
    const target = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    const senderId = interaction.user.id;

    if (target.id === senderId) {
      return interaction.reply({ embeds: [errorEmbed('That is you', 'You cannot gift aura to yourself.')], flags: MessageFlags.Ephemeral });
    }
    if (target.bot) {
      return interaction.reply({ embeds: [errorEmbed('That is a bot', 'Bots have no aura to receive.')], flags: MessageFlags.Ephemeral });
    }

    const check = checkCooldown('gift', senderId, COOLDOWNS.gift, { label: 'aura gifts' });
    if (!check.ok) {
      return interaction.reply({ embeds: [warningEmbed('Slow down', check.message)], flags: MessageFlags.Ephemeral });
    }

    const sender = progress(senderId);
    if (sender.aura < amount) {
      return interaction.reply({
        embeds: [errorEmbed('Not enough aura', `You hold **${formatNumber(sender.aura)}** aura and tried to give **${formatNumber(amount)}**.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const receiver = progress(target.id);
    if (MAX_AURA - receiver.aura < amount) {
      return interaction.reply({ embeds: [errorEmbed('They are at the ceiling', 'Their aura cannot take any more right now.')], flags: MessageFlags.Ephemeral });
    }

    saveProgress({ ...sender, aura: sender.aura - amount, giftsSent: (sender.giftsSent ?? 0) + 1 });
    saveProgress({ ...receiver, aura: receiver.aura + amount, giftsReceived: (receiver.giftsReceived ?? 0) + 1 });
    markUsed('gift', senderId);

    return interaction.reply({
      embeds: [
        webEmbed({
          title: '🕸️ Aura gifted',
          description: `${interaction.user} passed **${formatNumber(amount)}** aura to ${target}.`,
          color: brand.colors.primary,
          thumbnail: target.displayAvatarURL({ size: 128 }),
          fields: [
            { name: 'Your aura now', value: formatNumber(sender.aura - amount), inline: true },
            { name: 'Their aura now', value: formatNumber(receiver.aura + amount), inline: true },
            { name: 'Next gift', value: `in ${formatDuration(COOLDOWNS.gift)}`, inline: true },
          ],
        }),
      ],
      allowedMentions: { parse: [] },
    });
  },
};

export default [grow, gift];
