import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { config } from '../../config/config.js';
import { BLUEPRINT } from '../../config/serverBlueprint.js';
import { database } from '../../database/index.js';
import { sendLog } from '../../services/logs.js';
import { errorEmbed, modEmbed, progressBar, webEmbed } from '../../utils/embeds.js';
import { truncate } from '../../utils/format.js';
import { logger } from '../../utils/logger.js';
import { guardInvoker } from '../../utils/permissions.js';

const STAGES = ['Roles', 'Categories', 'Channels', 'Configuration'];

/**
 * Automated server setup.
 *
 * Idempotent by design: every role, category and channel is looked up by name
 * first and reused when it exists, so running /setup twice never duplicates
 * anything. Existing custom settings are never overwritten either — the bot only
 * fills in what is still empty.
 */
export async function runSetup(interaction) {
  const guild = interaction.guild;
  if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run /setup inside a server.')], flags: MessageFlags.Ephemeral });

  const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageGuild], { label: 'set up the server' });
  if (!invokerCheck.ok && !database.isOwner(interaction.user.id)) {
    return interaction.reply({
      embeds: [errorEmbed('Missing permission', `${invokerCheck.message}\n\nOnly members with **Manage Server** (or the bot owner) can run /setup.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const report = { created: [], reused: [], blocked: [], failed: [] };
  const roleIds = {};
  const categoryIds = {};
  const channelIds = {};

  const showProgress = async (index, detail) => {
    const steps = STAGES.map((stage, position) => (position < index ? '✅' : position === index ? '🕸️' : '▫️')).join(' ');
    await interaction
      .editReply({
        embeds: [
          modEmbed('Weaving the web…', `${progressBar(index, STAGES.length)} ${index}/${STAGES.length} stages\n${steps}\n\n**${STAGES[index]}** — ${detail}`, [
            { name: 'Created', value: String(report.created.length), inline: true },
            { name: 'Reused', value: String(report.reused.length), inline: true },
            { name: 'Blocked', value: String(report.blocked.length), inline: true },
          ]),
        ],
      })
      .catch(() => null);
  };

  // ── stage 1: roles ───────────────────────────────────────────────────────
  await showProgress(0, 'creating or reusing the web roles');
  await guild.roles.fetch().catch(() => null);
  const me = guild.members.me;
  const canManageRoles = Boolean(me?.permissions.has(PermissionFlagsBits.ManageRoles));
  const canManageChannels = Boolean(me?.permissions.has(PermissionFlagsBits.ManageChannels));

  for (const spec of BLUEPRINT.roles) {
    const existing = guild.roles.cache.find((role) => role.name === spec.name);
    if (existing) {
      roleIds[spec.key] = existing.id;
      report.reused.push(`role **${spec.name}**`);
      continue;
    }
    if (!canManageRoles) {
      report.blocked.push(`role **${spec.name}** — I need **Manage Roles**`);
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const role = await guild.roles.create({
        name: spec.name,
        colors: { primaryColor: spec.color },
        hoist: spec.hoist,
        mentionable: false,
        permissions: spec.permissions,
        reason: `${brand.short} /setup`,
      });
      roleIds[spec.key] = role.id;
      report.created.push(`role **${spec.name}**`);
    } catch (error) {
      report.failed.push(`role **${spec.name}** — ${error.message}`);
    }
  }

  // ── stage 2: categories ──────────────────────────────────────────────────
  await showProgress(1, 'grouping the web into categories');
  await guild.channels.fetch().catch(() => null);

  for (const spec of BLUEPRINT.categories) {
    const existing = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name === spec.name);
    if (existing) {
      categoryIds[spec.key] = existing.id;
      report.reused.push(`category **${spec.name}**`);
      continue;
    }
    if (!canManageChannels) {
      report.blocked.push(`category **${spec.name}** — I need **Manage Channels**`);
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const category = await guild.channels.create({ name: spec.name, type: ChannelType.GuildCategory, reason: `${brand.short} /setup` });
      categoryIds[spec.key] = category.id;
      report.created.push(`category **${spec.name}**`);
    } catch (error) {
      report.failed.push(`category **${spec.name}** — ${error.message}`);
    }
  }

  // ── stage 3: channels ────────────────────────────────────────────────────
  await showProgress(2, 'opening the channels with permission overwrites');

  for (const spec of BLUEPRINT.channels) {
    const existing = guild.channels.cache.find((channel) => channel.name === spec.name);
    if (existing) {
      channelIds[spec.key] = existing.id;
      report.reused.push(`channel **${spec.name}**`);
      continue;
    }
    if (!canManageChannels) {
      report.blocked.push(`channel **${spec.name}** — I need **Manage Channels**`);
      continue;
    }

    const permissionOverwrites = [];
    if (spec.readOnly || spec.staffOnly) {
      permissionOverwrites.push({
        id: guild.roles.everyone.id,
        deny: spec.staffOnly ? [PermissionFlagsBits.ViewChannel] : [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads],
      });
      for (const staffKey of ['admin', 'moderator']) {
        if (roleIds[staffKey]) {
          permissionOverwrites.push({
            id: roleIds[staffKey],
            allow: spec.staffOnly
              ? [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
              : [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads],
          });
        }
      }
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const channel = await guild.channels.create({
        name: spec.name,
        type: ChannelType.GuildText,
        parent: categoryIds[spec.category] ?? null,
        topic: spec.topic ?? null,
        permissionOverwrites,
        reason: `${brand.short} /setup`,
      });
      channelIds[spec.key] = channel.id;
      report.created.push(`channel **${spec.name}**`);
    } catch (error) {
      report.failed.push(`channel **${spec.name}** — ${error.message}`);
    }
  }

  // ── stage 4: configuration ───────────────────────────────────────────────
  await showProgress(3, 'saving IDs and wiring welcome, autorole and logs');

  const settings = database.settings(guild.id);
  const patch = {};

  // Only fill in what is empty, so a re-run never clobbers custom settings.
  const assign = (key, value) => {
    if (!settings[key] && value) patch[key] = value;
  };
  assign('welcomeChannelId', channelIds.welcome);
  assign('goodbyeChannelId', channelIds.welcome);
  assign('announcementChannelId', channelIds.announcements);
  assign('logChannelId', channelIds.modLogs);
  assign('verifyChannelId', channelIds.welcome);
  assign('autoroleRoleId', roleIds.member);
  assign('verifyRoleId', roleIds.member);

  database.updateGuild(guild.id, {
    name: guild.name,
    roles: roleIds,
    categories: categoryIds,
    channels: channelIds,
    setup: { version: config.setupBlueprintVersion, completedAt: Date.now() },
    settings: patch,
  });

  const summary = webEmbed({
    title: `${brand.emoji.web} Setup ${report.failed.length ? 'finished with issues' : 'complete'}`,
    description: [
      `The web has been woven in **${guild.name}**.`,
      'Run `/setup` as often as you like — it reuses what exists and never creates duplicates.',
    ].join('\n'),
    fields: [
      { name: `✅ Created (${report.created.length})`, value: truncate(report.created.join('\n') || 'nothing new — everything already existed', 1020), inline: false },
      { name: `♻️ Reused (${report.reused.length})`, value: truncate(report.reused.join('\n') || 'nothing', 1020), inline: false },
      { name: `⚠️ Blocked by Discord (${report.blocked.length})`, value: truncate(report.blocked.join('\n') || 'none', 1020), inline: false },
      { name: `❌ Failed (${report.failed.length})`, value: truncate(report.failed.join('\n') || 'none', 1020), inline: false },
      {
        name: 'Next steps',
        value: ['`/config view` — inspect what was saved', '`/setverify` — post the verification panel', '`/autorole show` — check the entry role', '`/setlog channel` — confirm where logs go'].join('\n'),
        inline: false,
      },
    ],
    color: report.failed.length ? brand.colors.warning : brand.colors.success,
  });

  await interaction.editReply({ embeds: [summary] });

  logger.info(
    `/setup in ${guild.name}: ${report.created.length} created, ${report.reused.length} reused, ${report.blocked.length} blocked, ${report.failed.length} failed.`,
  );

  await sendLog(guild, {
    type: 'config',
    title: 'Automated setup completed',
    fields: [
      { name: 'Created', value: String(report.created.length), inline: true },
      { name: 'Reused', value: String(report.reused.length), inline: true },
      { name: 'Blocked', value: String(report.blocked.length), inline: true },
    ],
  });

  return summary;
}

const setup = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Build or repair the whole server: roles, categories, channels, logs and more'),
  async run(interaction) {
    return runSetup(interaction);
  },
};

export default [setup];
