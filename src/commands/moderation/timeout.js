import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { errorEmbed, modEmbed } from '../../utils/embeds.js';
import { formatDuration, parseDuration, truncate } from '../../utils/format.js';
import { guardBot, guardGuild, guardInvoker, guardTarget } from '../../utils/permissions.js';
import { logModerationAction } from '../../services/logs.js';

const MAX_TIMEOUT_MS = 28 * 86_400_000;
const MIN_TIMEOUT_MS = 1000;

async function applyTimeout(interaction, { milliseconds, label, action }) {
  const guildCheck = guardGuild(interaction);
  if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });

  const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ModerateMembers], { label: 'time out members' });
  if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

  const botCheck = guardBot(interaction.guild, [PermissionFlagsBits.ModerateMembers]);
  if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

  const targetCheck = await guardTarget(interaction, interaction.options.getUser('user').id, { action: 'time out' });
  if (!targetCheck.ok) return interaction.reply({ embeds: [errorEmbed('Blocked by Discord', targetCheck.message)], flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const target = targetCheck.target;
  const reason = truncate(`${interaction.user.tag}: ${interaction.options.getString('reason') ?? 'no reason given'}`, 400);

  try {
    await target.timeout(milliseconds, reason);
  } catch (error) {
    return interaction.reply({ embeds: [errorEmbed('Discord refused the timeout', error.message)], flags: MessageFlags.Ephemeral });
  }

  await interaction.reply({
    embeds: [
      modEmbed(label, null, [
        { name: 'Target', value: `${target.user.tag} (\`${target.id}\`)`, inline: true },
        { name: 'Duration', value: formatDuration(milliseconds), inline: true },
        { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Reason', value: reason, inline: false },
      ]),
    ],
    allowedMentions: { parse: [] },
  });

  await logModerationAction(guild, {
    action,
    moderator: interaction.user,
    target: target.user,
    reason,
    extra: [{ name: 'Duration', value: formatDuration(milliseconds), inline: true }],
  });
}

const timeout = {
  data: new SlashCommandBuilder()
    .setName('timeout')
    .setDescription('Time a member out (10s – 28d)')
    .addUserOption((option) => option.setName('user').setDescription('Who').setRequired(true))
    .addStringOption((option) => option.setName('duration').setDescription('e.g. 10m, 1h, 7d').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(false).setMaxLength(400)),
  async run(interaction) {
    const raw = interaction.options.getString('duration');
    const parsed = parseDuration(raw);

    if (!parsed || parsed < MIN_TIMEOUT_MS) {
      return interaction.reply({
        embeds: [errorEmbed('Invalid duration', `\`${raw}\` is not a valid duration. Try \`10m\`, \`1h\` or \`7d\`.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const milliseconds = Math.min(parsed, MAX_TIMEOUT_MS);
    const note = parsed > MAX_TIMEOUT_MS ? ` (capped at ${formatDuration(MAX_TIMEOUT_MS)} — Discord's limit)` : '';
    return applyTimeout(interaction, { milliseconds, label: `Member timed out${note}`, action: 'Timeout' });
  },
};

const untimeout = {
  data: new SlashCommandBuilder()
    .setName('untimeout')
    .setDescription('Remove a member timeout')
    .addUserOption((option) => option.setName('user').setDescription('Who').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(false).setMaxLength(400)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });

    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ModerateMembers], { label: 'remove timeouts' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const botCheck = guardBot(interaction.guild, [PermissionFlagsBits.ModerateMembers]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const targetCheck = await guardTarget(interaction, interaction.options.getUser('user').id, { action: 'untimeout' });
    if (!targetCheck.ok) return interaction.reply({ embeds: [errorEmbed('Blocked by Discord', targetCheck.message)], flags: MessageFlags.Ephemeral });

    const target = targetCheck.target;
    const reason = truncate(`${interaction.user.tag}: ${interaction.options.getString('reason') ?? 'no reason given'}`, 400);

    if (!target.isCommunicationDisabled?.()) {
      return interaction.reply({ embeds: [errorEmbed('Not timed out', `${target.user.tag} is not currently timed out.`)], flags: MessageFlags.Ephemeral });
    }

    try {
      await target.timeout(null, reason);
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Discord refused the change', error.message)], flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
      embeds: [
        modEmbed('Timeout removed', null, [
          { name: 'Target', value: `${target.user.tag}`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
        ]),
      ],
      allowedMentions: { parse: [] },
    });

    await logModerationAction(interaction.guild, { action: 'Untimeout', moderator: interaction.user, target: target.user, reason });
  },
};

const mute = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Longest possible timeout (28 days) — the modern Discord mute')
    .addUserOption((option) => option.setName('user').setDescription('Who').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(false).setMaxLength(400)),
  async run(interaction) {
    return applyTimeout(interaction, { milliseconds: MAX_TIMEOUT_MS, label: 'Member muted (28 days)', action: 'Mute' });
  },
};

const unmute = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Lift a mute / timeout')
    .addUserOption((option) => option.setName('user').setDescription('Who').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(false).setMaxLength(400)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });

    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ModerateMembers], { label: 'unmute members' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const botCheck = guardBot(interaction.guild, [PermissionFlagsBits.ModerateMembers]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const targetCheck = await guardTarget(interaction, interaction.options.getUser('user').id, { action: 'unmute' });
    if (!targetCheck.ok) return interaction.reply({ embeds: [errorEmbed('Blocked by Discord', targetCheck.message)], flags: MessageFlags.Ephemeral });

    const target = targetCheck.target;
    const reason = truncate(`${interaction.user.tag}: ${interaction.options.getString('reason') ?? 'no reason given'}`, 400);

    try {
      await target.timeout(null, reason);
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Discord refused the change', error.message)], flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
      embeds: [
        modEmbed('Member unmuted', null, [
          { name: 'Target', value: `${target.user.tag}`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
        ]),
      ],
      allowedMentions: { parse: [] },
    });

    await logModerationAction(interaction.guild, { action: 'Unmute', moderator: interaction.user, target: target.user, reason });
  },
};

export default [timeout, untimeout, mute, unmute];
