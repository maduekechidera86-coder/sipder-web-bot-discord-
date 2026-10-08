import { ChannelType, MessageFlags, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { database } from '../../database/index.js';
import { errorEmbed, infoEmbed, webEmbed } from '../../utils/embeds.js';
import { formatNumber, truncate } from '../../utils/format.js';

const VERIFICATION_LABELS = ['none', 'low', 'medium', 'high', 'very high'];

const serverinfo = {
  data: new SlashCommandBuilder().setName('serverinfo').setDescription('Details about this server'),
  async run(interaction) {
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

    await guild.fetch().catch(() => null);
    const owner = await guild.fetchOwner().catch(() => null);
    const record = database.guild(guild);

    const members = guild.members.cache;
    const bots = members.filter((member) => member.user.bot).size;
    const text = guild.channels.cache.filter((channel) => channel.isTextBased()).size;
    const voice = guild.channels.cache.filter((channel) => channel.isVoiceBased()).size;

    return interaction.reply({
      embeds: [
        webEmbed({
          title: `${brand.emoji.web} ${guild.name}`,
          description: guild.description ?? `**${formatNumber(guild.memberCount)}** souls in the web.`,
          thumbnail: guild.iconURL({ size: 256 }) ?? null,
          fields: [
            { name: 'Owner', value: owner ? `<@${owner.id}>` : '`unknown`', inline: true },
            { name: 'Server ID', value: `\`${guild.id}\``, inline: true },
            { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'Members', value: `${formatNumber(guild.memberCount)} total · ${formatNumber(guild.memberCount - bots)} humans · ${bots} bots`, inline: false },
            { name: 'Channels', value: `${text} text · ${voice} voice · ${guild.channels.cache.filter((c) => c.type === ChannelType.GuildCategory).size} categories`, inline: false },
            { name: 'Roles', value: `${guild.roles.cache.size}`, inline: true },
            { name: 'Boosts', value: `${guild.premiumSubscriptionCount ?? 0} (tier ${guild.premiumTier})`, inline: true },
            { name: 'Verification', value: VERIFICATION_LABELS[guild.verificationLevel] ?? 'unknown', inline: true },
            { name: 'Bot setup', value: record.setup?.completedAt ? `completed <t:${Math.floor(record.setup.completedAt / 1000)}:R>` : 'not run yet — use `/setup`', inline: false },
          ],
        }),
      ],
    });
  },
};

const roles = {
  data: new SlashCommandBuilder().setName('roles').setDescription('List the roles in this server'),
  async run(interaction) {
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

    await guild.roles.fetch().catch(() => null);
    const list = [...guild.roles.cache.values()]
      .filter((role) => role.id !== guild.roles.everyone.id)
      .sort((a, b) => b.position - a.position)
      .slice(0, 40);

    const lines = list.map((role) => `${role.toString()} · \`${role.members.size}\` member(s)${role.managed ? ' · managed' : ''}`);

    return interaction.reply({
      embeds: [
        infoEmbed(`Roles — ${guild.roles.cache.size} total`, truncate(lines.join('\n') || 'No roles.', 3000), [
          { name: `${brand.emoji.crown} Note`, value: 'Only the top 40 roles by position are shown.', inline: false },
        ]),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

const channels = {
  data: new SlashCommandBuilder().setName('channels').setDescription('List every channel, grouped by category'),
  async run(interaction) {
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

    const categories = guild.channels.cache
      .filter((channel) => channel.type === ChannelType.GuildCategory)
      .sort((a, b) => a.rawPosition - b.rawPosition);

    const fields = [];
    for (const category of categories.values()) {
      const children = guild.channels.cache
        .filter((channel) => channel.parentId === category.id)
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .map((channel) => `${channel.type === ChannelType.GuildVoice ? '🔊' : '💬'} ${channel.toString()}`);
      fields.push({ name: truncate(category.name, 100), value: truncate(children.join('\n') || 'empty', 1020), inline: false });
      if (fields.length >= 24) break;
    }

    const orphans = guild.channels.cache.filter((channel) => !channel.parentId && channel.type !== ChannelType.GuildCategory);
    if (orphans.size) {
      fields.push({
        name: 'No category',
        value: truncate([...orphans.values()].map((channel) => `💬 ${channel.toString()}`).join('\n'), 1020),
        inline: false,
      });
    }

    return interaction.reply({
      embeds: [infoEmbed(`Channels — ${guild.channels.cache.size}`, `**${categories.size}** categories`, fields.slice(0, 25))],
      flags: MessageFlags.Ephemeral,
    });
  },
};

const servericon = {
  data: new SlashCommandBuilder().setName('servericon').setDescription('Show this server icon in full size'),
  async run(interaction) {
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

    const icon = guild.iconURL({ size: 1024, extension: 'png' });
    if (!icon) return interaction.reply({ embeds: [errorEmbed('No icon', `**${guild.name}** has not set a server icon.`)], flags: MessageFlags.Ephemeral });

    return interaction.reply({
      embeds: [
        webEmbed({
          title: `${brand.emoji.web} ${guild.name} — icon`,
          image: icon,
          fields: [
            { name: 'PNG', value: `[1024](${guild.iconURL({ size: 1024, extension: 'png' })}) · [512](${guild.iconURL({ size: 512, extension: 'png' })})`, inline: true },
            { name: 'WebP', value: `[1024](${guild.iconURL({ size: 1024, extension: 'webp' })}) · [256](${guild.iconURL({ size: 256, extension: 'webp' })})`, inline: true },
          ],
        }),
      ],
    });
  },
};

const serverbanner = {
  data: new SlashCommandBuilder().setName('serverbanner').setDescription('Show this server banner in full size'),
  async run(interaction) {
    const guild = interaction.guild;
    if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

    await guild.fetch().catch(() => null);
    const banner = guild.bannerURL({ size: 1024 });
    if (!banner) {
      return interaction.reply({
        embeds: [errorEmbed('No banner', `**${guild.name}** has no banner. Boost the server to level 2 to unlock one.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      embeds: [
        webEmbed({
          title: `${brand.emoji.web} ${guild.name} — banner`,
          image: banner,
          fields: [{ name: 'Download', value: `[PNG 1024](${guild.bannerURL({ size: 1024, extension: 'png' })})`, inline: true }],
        }),
      ],
    });
  },
};

export default [serverinfo, roles, channels, servericon, serverbanner];
