import { SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { database } from '../../database/index.js';
import { progressionLeaderboard } from '../../database/progression.js';
import { infoEmbed } from '../../utils/embeds.js';
import { formatNumber } from '../../utils/format.js';

const MEDALS = ['🥇', '🥈', '🥉'];

function nameOf(id) {
  const known = database.user(id).username;
  return known ? `**${known}**` : `<@${id}>`;
}

function board({ field, title, describe }) {
  return {
    data: new SlashCommandBuilder()
      .setName(title)
      .setDescription(`The top members by ${field}`)
      .addIntegerOption((option) => option.setName('top').setDescription('How many (5-25)').setRequired(false).setMinValue(5).setMaxValue(25)),
    async run(interaction) {
      const limit = interaction.options.getInteger('top') ?? 10;
      const rows = progressionLeaderboard(field, limit);

      if (!rows.length) {
        return interaction.reply({
          embeds: [infoEmbed(`${field} leaderboard`, `Nobody has any ${field} yet. Chatting, \`/grow\` and \`/daily\` all feed it.`)],
        });
      }

      const lines = rows.map((row, index) => `${MEDALS[index] ?? `**#${index + 1}**`} ${nameOf(row.id)} — ${formatNumber(row.value)}`);

      return interaction.reply({
        embeds: [
          infoEmbed(`🕸️ ${brand.short} — ${field} leaderboard`, describe, [
            { name: `Top ${rows.length}`, value: lines.join('\n'), inline: false },
          ]),
        ],
        allowedMentions: { parse: [] },
      });
    },
  };
}

const auraBoard = board({
  field: 'aura',
  title: 'aura-leaderboard',
  describe: 'Aura is earned by chatting (one tick every two minutes), by `/grow` every six hours and by gifts.',
});

const xpBoard = board({
  field: 'xp',
  title: 'xp-leaderboard',
  describe: 'XP comes from chatting (8–16 per minute), `/grow` and level rewards. `/rank` turns XP into a level.',
});

export default [auraBoard, xpBoard];
