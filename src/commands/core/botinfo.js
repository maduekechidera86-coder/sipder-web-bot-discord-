import { MessageFlags, SlashCommandBuilder, version as djsVersion } from 'discord.js';

import { brand } from '../../config/brand.js';
import { config } from '../../config/config.js';
import { database } from '../../database/index.js';
import { webEmbed } from '../../utils/embeds.js';
import { formatBytes, formatDuration, formatNumber } from '../../utils/format.js';

export const INVITE_PERMISSIONS = [
  'ViewChannel',
  'SendMessages',
  'EmbedLinks',
  'AttachFiles',
  'ReadMessageHistory',
  'AddReactions',
  'UseExternalEmojis',
  'ManageMessages',
  'ManageChannels',
  'ManageRoles',
  'KickMembers',
  'BanMembers',
  'ModerateMembers',
  'ManageNicknames',
  'ViewAuditLog',
  'MentionEveryone',
  'ManageWebhooks',
  'Connect',
];

export function buildInvite(client, permissions = null) {
  try {
    return client.generateInvite({
      scopes: ['bot', 'applications.commands'],
      permissions: permissions ?? INVITE_PERMISSIONS,
    });
  } catch {
    return null;
  }
}

const botinfo = {
  data: new SlashCommandBuilder().setName('botinfo').setDescription('Everything about this bot: version, uptime, memory, links'),
  async run(interaction) {
    const client = interaction.client;
    const memory = process.memoryUsage();
    const invite = buildInvite(client);
    const stats = database.stats();

    return interaction.reply({
      embeds: [
        webEmbed({
          title: `${brand.name}`,
          description: `**${brand.tagline}**\nOwner: **${brand.owner}**`,
          thumbnail: client.user.displayAvatarURL({ size: 256 }),
          fields: [
            { name: 'Bot', value: `${client.user.tag}\n\`${client.user.id}\``, inline: true },
            { name: 'Version', value: `${brand.version} · discord.js ${djsVersion}\nNode ${process.version}`, inline: true },
            { name: 'Uptime', value: formatDuration(client.uptime ?? 0), inline: true },
            { name: 'Servers', value: formatNumber(client.guilds.cache.size), inline: true },
            { name: 'Cached users', value: formatNumber(client.users.cache.size), inline: true },
            { name: 'Commands', value: `${client.commands.size} loaded`, inline: true },
            { name: 'Memory', value: `${formatBytes(memory.heapUsed)} heap · ${formatBytes(memory.rss)} RSS`, inline: true },
            { name: 'API layer', value: config.mediaApiEndpoint, inline: true },
            { name: 'Storage', value: `${stats.guilds} guild(s) · ${stats.users} profile(s)`, inline: true },
            { name: 'Invite me', value: invite ? `[Permission-optimised invite](${invite})` : 'Ask an admin to re-invite me.', inline: false },
          ],
          color: brand.colors.primary,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default [botinfo];
