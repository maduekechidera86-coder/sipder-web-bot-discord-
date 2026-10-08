import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { config } from '../../config/config.js';
import { database } from '../../database/index.js';
import { prexzy } from '../../services/prexzy.js';
import { infoEmbed, webEmbed } from '../../utils/embeds.js';
import { formatBytes, formatDuration, formatNumber } from '../../utils/format.js';

const ping = {
  data: new SlashCommandBuilder().setName('ping').setDescription('Check the web connection (latency)'),
  async run(interaction) {
    await interaction.reply({ embeds: [webEmbed({ title: `${brand.emoji.web} Pinging the web…`, color: brand.colors.info })], flags: MessageFlags.Ephemeral });
    const message = await interaction.fetchReply();
    const roundtrip = Math.max(0, message.createdTimestamp - interaction.createdTimestamp);

    return interaction.editReply({
      embeds: [
        webEmbed({
          title: `${brand.emoji.bolt} Pong`,
          fields: [
            { name: 'Gateway latency', value: `${Math.round(interaction.client.ws.ping)}ms`, inline: true },
            { name: 'Round trip', value: `${roundtrip}ms`, inline: true },
            { name: 'Nodes', value: `${interaction.client.guilds.cache.size} servers`, inline: true },
          ],
          color: brand.colors.success,
        }),
      ],
    });
  },
};

const uptime = {
  data: new SlashCommandBuilder().setName('uptime').setDescription('How long the bot has been awake'),
  async run(interaction) {
    const uptimeMs = interaction.client.uptime ?? 0;
    const startedAt = interaction.client.startedAt ?? Date.now() - uptimeMs;

    return interaction.reply({
      embeds: [
        infoEmbed('Uptime', null, [
          { name: 'Awake for', value: formatDuration(uptimeMs), inline: true },
          { name: 'Started', value: `<t:${Math.floor(startedAt / 1000)}:R>`, inline: true },
          { name: 'Database', value: `${database.guildCount()} guild(s) stored`, inline: true },
        ]),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

const status = {
  data: new SlashCommandBuilder().setName('status').setDescription('Full status report: connection, API, storage and maintenance state'),
  async run(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const client = interaction.client;
    const health = await prexzy.health();
    const stats = database.stats();
    const state = database.state();
    const memory = process.memoryUsage();

    return interaction.editReply({
      embeds: [
        webEmbed({
          title: `${brand.emoji.spider} ${brand.short} — status`,
          description: `${brand.tagline}`,
          fields: [
            { name: 'Gateway', value: `${Math.round(client.ws.ping)}ms ping · ${client.ws.status === 0 ? 'ready' : `code ${client.ws.status}`}`, inline: true },
            { name: 'Uptime', value: formatDuration(client.uptime ?? 0), inline: true },
            { name: 'Servers', value: formatNumber(client.guilds.cache.size), inline: true },
            {
              name: `API layer (${config.mediaApiEndpoint.replace(/^https?:\/\//, '')})`,
              value: health.reachable ? `reachable · HTTP ${health.status} in ${health.ms}ms` : `unreachable — ${health.error}`,
              inline: true,
            },
            { name: 'Commands loaded', value: `${client.commands.size}`, inline: true },
            { name: 'Maintenance', value: state.maintenance ? `ON since <t:${Math.floor((state.maintenanceSince ?? Date.now()) / 1000)}:R>` : 'off', inline: true },
            { name: 'Storage', value: `${stats.guilds} guild(s) · ${stats.users} profile(s) · ${stats.auditEntries} audit entr(ies)`, inline: false },
            { name: 'Memory', value: `${formatBytes(memory.heapUsed)} heap · ${formatBytes(memory.rss)} RSS`, inline: true },
            { name: 'Node', value: process.version, inline: true },
          ],
          color: health.reachable ? brand.colors.success : brand.colors.warning,
        }),
      ],
    });
  },
};

export default [ping, uptime, status];
