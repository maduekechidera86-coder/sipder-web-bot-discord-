import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { RANKS, auraCooldown, card, xpCooldown } from '../../services/progression.js';
import { infoEmbed, webEmbed } from '../../utils/embeds.js';
import { formatDuration, formatNumber, timeAgo } from '../../utils/format.js';

/** The aura, XP, level and streak views — all read from the same stored records. */

const resolveTarget = (interaction) => interaction.options.getUser('user') ?? interaction.user;

const RANK_LADDER = { name: 'The ladder', value: RANKS.map((rank) => `${rank.name} — level ${rank.level}`).join('\n'), inline: false };

const aura = {
  data: new SlashCommandBuilder()
    .setName('aura')
    .setDescription('Check a member’s aura')
    .addUserOption((option) => option.setName('user').setDescription('Whose aura (defaults to you)').setRequired(false)),
  async run(interaction) {
    const target = resolveTarget(interaction);
    const record = card(target.id);
    const cooldown = auraCooldown(target.id);

    return interaction.reply({
      embeds: [
        webEmbed({
          title: `🕸️ ${target.username} — aura`,
          description: `**${formatNumber(record.aura)}** aura held.`,
          thumbnail: target.displayAvatarURL({ size: 256 }),
          color: brand.colors.primary,
          fields: [
            { name: 'Rank', value: record.rank.name, inline: true },
            { name: 'Level', value: `${record.level} / 100`, inline: true },
            { name: 'Gifts', value: `${formatNumber(record.giftsReceived ?? 0)} received · ${formatNumber(record.giftsSent ?? 0)} sent`, inline: true },
            { name: 'Aura tick', value: cooldown > 0 ? `ready in ${formatDuration(cooldown)}` : 'ready now', inline: true },
            { name: 'Last aura', value: record.lastAuraAt ? timeAgo(record.lastAuraAt) : 'never', inline: true },
            RANK_LADDER,
          ],
        }),
      ],
      allowedMentions: { parse: [] },
    });
  },
};

const rank = {
  data: new SlashCommandBuilder()
    .setName('rank')
    .setDescription('The full rank card: level, XP, rank and progress')
    .addUserOption((option) => option.setName('user').setDescription('Whose rank (defaults to you)').setRequired(false)),
  async run(interaction) {
    const target = resolveTarget(interaction);
    const record = card(target.id);
    const next = record.nextRank;

    return interaction.reply({
      embeds: [
        webEmbed({
          title: `${record.rank.name} — ${target.username}`,
          description: record.maxed
            ? '**Level 100 reached.** The web answered to you.'
            : `\`${record.bar}\` **${formatNumber(record.xpIntoLevel)} / ${formatNumber(record.xpForNextLevel)}** XP to level ${record.level + 1}`,
          thumbnail: target.displayAvatarURL({ size: 256 }),
          color: brand.colors.primary,
          fields: [
            { name: 'Level', value: `**${record.level}** / 100`, inline: true },
            { name: 'Total XP', value: formatNumber(record.xp), inline: true },
            { name: 'Aura', value: formatNumber(record.aura), inline: true },
            { name: 'Next rank', value: next ? `${next.name} at level ${next.level} (${next.level - record.level} to go)` : 'none — you are at the top', inline: false },
            { name: 'Streak', value: `${record.streak ?? 0} day(s)`, inline: true },
            { name: 'XP tick', value: xpCooldown(target.id) > 0 ? `ready in ${formatDuration(xpCooldown(target.id))}` : 'ready now', inline: true },
          ],
        }),
      ],
      allowedMentions: { parse: [] },
    });
  },
};

const level = {
  data: new SlashCommandBuilder()
    .setName('level')
    .setDescription('Just the level and the XP still needed')
    .addUserOption((option) => option.setName('user').setDescription('Whose level (defaults to you)').setRequired(false)),
  async run(interaction) {
    const target = resolveTarget(interaction);
    const record = card(target.id);
    const remaining = record.maxed ? 0 : record.xpForNextLevel - record.xpIntoLevel;

    return interaction.reply({
      embeds: [
        infoEmbed(`${target.username} is level ${record.level}`, record.maxed ? 'Maxed out at level 100.' : `**${formatNumber(remaining)}** XP left to reach level **${record.level + 1}**.`, [
          { name: 'Progress', value: `\`${record.bar}\``, inline: false },
          { name: 'XP this level', value: `${formatNumber(record.xpIntoLevel)} / ${formatNumber(record.xpForNextLevel)}`, inline: true },
          { name: 'XP total', value: formatNumber(record.xp), inline: true },
          { name: 'Rank', value: record.rank.name, inline: true },
          { name: 'How XP is earned', value: 'Chatting earns 8–16 XP per minute, `/grow` pays a bigger share every 6 hours, and level-ups pay coins and aura.', inline: false },
        ]),
      ],
      allowedMentions: { parse: [] },
    });
  },
};

const xp = {
  data: new SlashCommandBuilder()
    .setName('xp')
    .setDescription('XP totals, cooldown and how the curve works')
    .addUserOption((option) => option.setName('user').setDescription('Whose XP (defaults to you)').setRequired(false)),
  async run(interaction) {
    const target = resolveTarget(interaction);
    const record = card(target.id);
    const cooldown = xpCooldown(target.id);

    return interaction.reply({
      embeds: [
        infoEmbed(`${target.username} — XP`, null, [
          { name: 'Total XP', value: formatNumber(record.xp), inline: true },
          { name: 'Level', value: String(record.level), inline: true },
          { name: 'Rank', value: record.rank.name, inline: true },
          { name: 'Into this level', value: `${formatNumber(record.xpIntoLevel)} / ${formatNumber(record.xpForNextLevel)}`, inline: true },
          { name: 'Next level costs', value: `${formatNumber(record.xpForNextLevel)} XP`, inline: true },
          { name: 'Activity cooldown', value: cooldown > 0 ? `ready in ${formatDuration(cooldown)}` : 'ready now', inline: true },
        ]),
      ],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  },
};

const streak = {
  data: new SlashCommandBuilder()
    .setName('streak')
    .setDescription('Your daily streak and when /daily is ready again')
    .addUserOption((option) => option.setName('user').setDescription('Whose streak (defaults to you)').setRequired(false)),
  async run(interaction) {
    const target = resolveTarget(interaction);
    const record = card(target.id);

    return interaction.reply({
      embeds: [
        infoEmbed(`${target.username} — streak`, null, [
          { name: 'Current streak', value: `${record.streak ?? 0} day(s)`, inline: true },
          { name: 'Last collected', value: record.lastDaily ? timeAgo(record.lastDaily) : 'never', inline: true },
          { name: 'Streak rule', value: 'Collect `/daily` within 48 hours to keep it alive. Each day adds 25 coins, up to day 30.', inline: false },
        ]),
      ],
      allowedMentions: { parse: [] },
    });
  },
};

export default [aura, rank, level, xp, streak];
