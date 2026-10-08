import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { database } from '../../database/index.js';
import { errorEmbed, ownerEmbed } from '../../utils/embeds.js';
import { timeAgo, truncate } from '../../utils/format.js';
import { logger } from '../../utils/logger.js';
import { guardOwner } from '../../utils/permissions.js';

const TYPE_CHOICES = [
  { name: 'everything', value: 'all' },
  { name: 'moderation', value: 'moderation' },
  { name: 'member', value: 'member' },
  { name: 'security', value: 'security' },
  { name: 'configuration', value: 'config' },
  { name: 'errors', value: 'error' },
];

const logs = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('Owner: inspect the audit trail and the raw log file')
    .addIntegerOption((option) => option.setName('lines').setDescription('How many entries (5-50)').setRequired(false).setMinValue(5).setMaxValue(50))
    .addStringOption((option) =>
      option.setName('type').setDescription('Filter by kind of entry').setRequired(false).addChoices(...TYPE_CHOICES),
    )
    .addStringOption((option) =>
      option.setName('source').setDescription('Where to read from').setRequired(false).addChoices({ name: 'audit trail (database)', value: 'audit' }, { name: 'log file (text)', value: 'file' }),
    ),
  async run(interaction) {
    const ownerCheck = guardOwner(interaction.user.id, database.isOwner(interaction.user.id), { action: 'read the logs' });
    if (!ownerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Owner only', ownerCheck.message)], flags: MessageFlags.Ephemeral });

    const lines = interaction.options.getInteger('lines') ?? 15;
    const type = interaction.options.getString('type') ?? 'all';
    const source = interaction.options.getString('source') ?? 'audit';

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (source === 'file') {
      const tail = await logger.readTail(lines);
      return interaction.editReply({
        embeds: [
          ownerEmbed('Log file — last lines', tail.length ? null : 'The log file is empty or has not been written yet.', [
            { name: `\`${logger.filePath()}\``, value: truncate(tail.join('\n') || 'nothing', 3500), inline: false },
          ]),
        ],
      });
    }

    const entries = database.auditEntries(lines, { types: type === 'all' ? null : [type] });

    return interaction.editReply({
      embeds: [
        ownerEmbed(`Audit trail — ${entries.length} entr(ies)`, type === 'all' ? 'Everything the bot recorded.' : `Filtered by **${type}**.`, [
          {
            name: 'Recent activity',
            value: truncate(
              entries
                .map((entry) => {
                  const scopeLabel = entry.guildId ? `guild \`${entry.guildId}\`` : 'global';
                  return `**${entry.type ?? 'info'}** · ${entry.title ?? 'no title'}\n> ${entry.description ?? '—'} · ${scopeLabel} · ${timeAgo(entry.createdAt)}`;
                })
                .join('\n\n') || 'nothing recorded yet',
              3500,
            ),
            inline: false,
          },
        ]),
      ],
    });
  },
};

export default [logs];
