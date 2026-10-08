import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { config } from '../../config/config.js';
import { database } from '../../database/index.js';
import { prexzy } from '../../services/prexzy.js';
import { errorEmbed, ownerEmbed } from '../../utils/embeds.js';
import { formatBytes, formatDuration, formatNumber, timeAgo, truncate } from '../../utils/format.js';
import { guardOwner } from '../../utils/permissions.js';

const stats = {
  data: new SlashCommandBuilder().setName('stats').setDescription('Owner: full bot statistics across every server'),
  async run(interaction) {
    const ownerCheck = guardOwner(interaction.user.id, database.isOwner(interaction.user.id), { action: 'see the statistics' });
    if (!ownerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Owner only', ownerCheck.message)], flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const client = interaction.client;
    const health = await prexzy.health();
    const statsData = database.stats();
    const memory = process.memoryUsage();

    return interaction.editReply({
      embeds: [
        ownerEmbed(`${brand.name} — statistics`, `${brand.tagline}`, [
          { name: 'Servers', value: formatNumber(client.guilds.cache.size), inline: true },
          { name: 'Cached users', value: formatNumber(client.users.cache.size), inline: true },
          { name: 'Profiles stored', value: formatNumber(statsData.users), inline: true },
          { name: 'Commands used', value: formatNumber(statsData.counters?.commandsRun ?? 0), inline: true },
          { name: 'Warnings stored', value: formatNumber(statsData.warnings), inline: true },
          { name: 'Audit entries', value: formatNumber(statsData.auditEntries), inline: true },
          { name: 'Loaded commands', value: String(client.commands.size), inline: true },
          { name: 'Uptime', value: formatDuration(client.uptime ?? 0), inline: true },
          { name: 'Gateway', value: `${Math.round(client.ws.ping)}ms`, inline: true },
          { name: 'Memory', value: `${formatBytes(memory.heapUsed)} heap · ${formatBytes(memory.rss)} RSS`, inline: true },
          { name: 'API layer', value: health.reachable ? `up (HTTP ${health.status}, ${health.ms}ms)` : `down (${health.error})`, inline: true },
          { name: 'Endpoint', value: config.mediaApiEndpoint, inline: true },
          { name: 'Database file', value: `\`${truncate(statsData.file, 120)}\``, inline: false },
        ]),
      ],
    });
  },
};

const users = {
  data: new SlashCommandBuilder()
    .setName('users')
    .setDescription('Owner: browse the stored user profiles')
    .addStringOption((option) => option.setName('search').setDescription('Filter by id or username').setRequired(false).setMaxLength(60))
    .addIntegerOption((option) => option.setName('limit').setDescription('How many to show (5-25)').setRequired(false).setMinValue(5).setMaxValue(25)),
  async run(interaction) {
    const ownerCheck = guardOwner(interaction.user.id, database.isOwner(interaction.user.id), { action: 'browse users' });
    if (!ownerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Owner only', ownerCheck.message)], flags: MessageFlags.Ephemeral });

    const search = interaction.options.getString('search')?.toLowerCase() ?? null;
    const limit = interaction.options.getInteger('limit') ?? 10;

    let profiles = database.users().sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
    if (search) {
      profiles = profiles.filter(
        (profile) => profile.id.includes(search) || (profile.username ?? '').toLowerCase().includes(search),
      );
    }

    const total = profiles.length;
    const shown = profiles.slice(0, limit);

    return interaction.reply({
      embeds: [
        ownerEmbed(`Stored profiles — ${total} match(es)`, search ? `Filter: \`${search}\`` : 'Showing the most recently active profiles.', [
          {
            name: `Newest ${shown.length}`,
            value: truncate(
              shown
                .map(
                  (profile) =>
                    `**${profile.username ?? 'unknown'}** · \`${profile.id}\`\n> commands: ${profile.commandsUsed ?? 0} · last seen ${timeAgo(profile.lastSeen)}`,
                )
                .join('\n') || 'nothing yet',
              3000,
            ),
            inline: false,
          },
        ]),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default [stats, users];
