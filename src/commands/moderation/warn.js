import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { database } from '../../database/index.js';
import { errorEmbed, infoEmbed, modEmbed, warningEmbed } from '../../utils/embeds.js';
import { timeAgo, truncate } from '../../utils/format.js';
import { guardBot, guardGuild, guardInvoker, guardTarget } from '../../utils/permissions.js';
import { logModerationAction, sendLog } from '../../services/logs.js';

const ESCALATION = [
  { at: 3, note: '3 warnings — consider a timeout.' },
  { at: 5, note: '5 warnings — consider a kick.' },
  { at: 7, note: '7 warnings — consider a ban.' },
];

const warn = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a member and store it in the database')
    .addUserOption((option) => option.setName('user').setDescription('Who to warn').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(true).setMaxLength(400)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });

    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ModerateMembers], { label: 'warn members' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const botCheck = guardBot(interaction.guild, [PermissionFlagsBits.ModerateMembers]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const targetCheck = await guardTarget(interaction, interaction.options.getUser('user').id, { action: 'warn' });
    if (!targetCheck.ok) return interaction.reply({ embeds: [errorEmbed('Blocked by Discord', targetCheck.message)], flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const target = targetCheck.target;
    const reason = truncate(interaction.options.getString('reason'), 400);

    const list = database.addWarning(guild.id, target.id, {
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
    });
    const count = list.length;
    const entry = list[list.length - 1];
    const escalation = ESCALATION.find((step) => step.at === count);

    await target.user
      .send({
        embeds: [
          warningEmbed(`You were warned in ${guild.name}`, reason, [
            { name: 'Case', value: `#${entry.id}`, inline: true },
            { name: 'Total warnings', value: String(count), inline: true },
          ]),
        ],
      })
      .catch(() => null);

    await interaction.reply({
      embeds: [
        modEmbed('Member warned', null, [
          { name: 'Target', value: `${target.user.tag} (\`${target.id}\`)`, inline: true },
          { name: 'Case', value: `#${entry.id}`, inline: true },
          { name: 'Total', value: `${count} warning(s)`, inline: true },
          { name: 'Reason', value: reason, inline: false },
        ]),
      ],
      allowedMentions: { parse: [] },
    });

    await logModerationAction(guild, {
      action: 'Warn',
      moderator: interaction.user,
      target: target.user,
      reason,
      extra: [{ name: 'Total warnings', value: String(count), inline: true }],
    });

    if (escalation) {
      await sendLog(guild, {
        type: 'security',
        title: `${brand.emoji.warn} Warning escalation`,
        description: `<@${target.id}> now has **${count}** warnings. ${escalation.note}`,
        fields: [{ name: 'Latest reason', value: reason, inline: false }],
      });
    }
  },
};

const warnings = {
  data: new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('List the warnings stored for a member')
    .addUserOption((option) => option.setName('user').setDescription('Whose warnings (defaults to you)').setRequired(false)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });

    const user = interaction.options.getUser('user') ?? interaction.user;
    const isSelf = user.id === interaction.user.id;
    if (!isSelf) {
      const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ModerateMembers], { label: 'read other members warnings' });
      if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });
    }

    const list = database.warnings(interaction.guild.id, user.id);
    if (!list.length) {
      return interaction.reply({
        embeds: [infoEmbed('No warnings', `**${user.tag}** has a clean record here.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const lines = list.map(
      (entry) => `**#${entry.id}** · ${entry.reason}\n> by ${entry.moderatorTag ?? `<@${entry.moderatorId}>`} · ${timeAgo(entry.createdAt)}`,
    );

    return interaction.reply({
      embeds: [infoEmbed(`Warnings — ${user.tag}`, truncate(lines.join('\n\n'), 3500), [{ name: 'Total', value: `${list.length}`, inline: true }])],
      flags: MessageFlags.Ephemeral,
    });
  },
};

const unwarn = {
  data: new SlashCommandBuilder()
    .setName('unwarn')
    .setDescription('Remove one warning by its case number')
    .addUserOption((option) => option.setName('user').setDescription('Whose record').setRequired(true))
    .addIntegerOption((option) => option.setName('case').setDescription('The case number, see /warnings').setRequired(true).setMinValue(1)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });

    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ModerateMembers], { label: 'remove warnings' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const user = interaction.options.getUser('user');
    const caseId = interaction.options.getInteger('case');
    const removed = database.removeWarning(interaction.guild.id, user.id, caseId);

    if (!removed) {
      return interaction.reply({
        embeds: [errorEmbed('Case not found', `**${user.tag}** has no warning **#${caseId}**. Check \`/warnings\`.` )],
        flags: MessageFlags.Ephemeral,
      });
    }

    const remaining = database.warningCount(interaction.guild.id, user.id);

    await interaction.reply({
      embeds: [
        modEmbed('Warning removed', null, [
          { name: 'Target', value: `${user.tag}`, inline: true },
          { name: 'Case', value: `#${caseId}`, inline: true },
          { name: 'Remaining', value: String(remaining), inline: true },
          { name: 'Original reason', value: truncate(removed.reason, 400), inline: false },
        ]),
      ],
      allowedMentions: { parse: [] },
    });

    await logModerationAction(interaction.guild, {
      action: 'Unwarn',
      moderator: interaction.user,
      target: user,
      reason: `removed case #${caseId}`,
      extra: [{ name: 'Remaining', value: String(remaining), inline: true }],
    });
  },
};

export default [warn, warnings, unwarn];
