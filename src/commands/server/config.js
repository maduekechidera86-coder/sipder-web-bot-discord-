import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { database } from '../../database/index.js';
import { errorEmbed, infoEmbed, webEmbed } from '../../utils/embeds.js';
import { guardInvoker } from '../../utils/permissions.js';

const CHANNEL_KEYS = {
  logChannelId: 'Moderation log channel',
  announcementChannelId: 'Announcement channel',
  welcomeChannelId: 'Welcome channel',
  goodbyeChannelId: 'Goodbye channel',
  verifyChannelId: 'Verification channel',
};

function describeSetting(guild, key, value) {
  if (!value) return '`not set`';
  if (key.endsWith('ChannelId')) return guild.channels.cache.has(value) ? `<#${value}>` : `\`${value}\` (missing)`;
  if (key.endsWith('RoleId')) return guild.roles.cache.has(value) ? `<@&${value}>` : `\`${value}\` (missing)`;
  return String(value);
}

const configCommand = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('View or change everything this bot stores for this server')
    .addSubcommand((sub) => sub.setName('view').setDescription('Show the stored configuration'))
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Point one setting at a channel')
        .addStringOption((option) =>
          option
            .setName('key')
            .setDescription('Which setting')
            .setRequired(true)
            .addChoices(
              { name: 'Moderation log channel', value: 'logChannelId' },
              { name: 'Announcement channel', value: 'announcementChannelId' },
              { name: 'Welcome channel', value: 'welcomeChannelId' },
              { name: 'Goodbye channel', value: 'goodbyeChannelId' },
              { name: 'Verification channel', value: 'verifyChannelId' },
            ),
        )
        .addChannelOption((option) => option.setName('channel').setDescription('The target channel').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('toggle')
        .setDescription('Turn a module on or off')
        .addStringOption((option) =>
          option
            .setName('module')
            .setDescription('Which module')
            .setRequired(true)
            .addChoices(
              { name: 'Welcome messages', value: 'welcome' },
              { name: 'Goodbye messages', value: 'goodbye' },
              { name: 'Autorole', value: 'autorole' },
              { name: 'Server logs', value: 'logs' },
            ),
        )
        .addBooleanOption((option) => option.setName('enabled').setDescription('true = on, false = off').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('reset').setDescription('Reset messages + module switches (keeps channel/role IDs)')),

  async run(interaction) {
    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageGuild], { label: 'change the configuration' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

    const subcommand = interaction.options.getSubcommand();
    const record = database.guild(guild);

    if (subcommand === 'view') {
      const settings = record.settings;
      const fields = Object.entries(CHANNEL_KEYS).map(([key, label]) => ({
        name: label,
        value: describeSetting(guild, key, settings[key]),
        inline: true,
      }));

      fields.push(
        { name: 'Autorole role', value: describeSetting(guild, 'autoroleRoleId', settings.autoroleRoleId), inline: true },
        { name: 'Verification role', value: describeSetting(guild, 'verifyRoleId', settings.verifyRoleId), inline: true },
        {
          name: 'Modules',
          value: Object.entries(settings.modules ?? {})
            .map(([module, enabled]) => `${enabled ? '✅' : '❌'} ${module}`)
            .join('\n'),
          inline: true,
        },
        {
          name: 'Custom messages',
          value: `welcome: ${settings.welcomeMessage ? 'custom' : 'default'}\ngoodbye: ${settings.goodbyeMessage ? 'custom' : 'default'}`,
          inline: true,
        },
        {
          name: 'Setup',
          value: record.setup?.completedAt ? `completed <t:${Math.floor(record.setup.completedAt / 1000)}:R> (v${record.setup.version})` : 'not run yet — use `/setup`',
          inline: true,
        },
        { name: 'Commands run here', value: String(record.counters?.commandsRun ?? 0), inline: true },
      );

      return interaction.reply({
        embeds: [
          webEmbed({
            title: `${brand.emoji.gear} ${guild.name} — configuration`,
            description: 'Everything below is stored in the database and survives restarts.',
            fields,
            color: brand.colors.primary,
            thumbnail: guild.iconURL({ size: 128 }) ?? null,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'set') {
      const key = interaction.options.getString('key');
      const channel = interaction.options.getChannel('channel');
      if (!channel?.isTextBased?.()) {
        return interaction.reply({ embeds: [errorEmbed('Wrong channel', 'Pick a normal text channel.')], flags: MessageFlags.Ephemeral });
      }
      database.setSetting(guild.id, key, channel.id);
      return interaction.reply({
        embeds: [infoEmbed('Configuration saved', `${CHANNEL_KEYS[key]} → <#${channel.id}>`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'toggle') {
      const module = interaction.options.getString('module');
      const enabled = interaction.options.getBoolean('enabled');
      database.toggleModule(guild.id, module, enabled);
      return interaction.reply({
        embeds: [infoEmbed('Module updated', `**${module}** is now ${enabled ? '✅ **on**' : '❌ **off**'}.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    // reset
    database.updateGuild(guild.id, {
      settings: {
        welcomeMessage: null,
        goodbyeMessage: null,
        modules: { welcome: true, goodbye: true, autorole: true, logs: true },
      },
    });

    return interaction.reply({
      embeds: [infoEmbed('Configuration reset', 'Custom welcome/goodbye text was cleared and every module was switched back on. Channel and role IDs were kept.')],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default [configCommand];
