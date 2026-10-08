import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { errorEmbed, modEmbed } from '../../utils/embeds.js';
import { truncate } from '../../utils/format.js';
import { guardBot, guardGuild, guardInvoker, guardTarget } from '../../utils/permissions.js';
import { logModerationAction } from '../../services/logs.js';

const REASON_MAX = 400;

function reasonFor(interaction, reason) {
  return truncate(`${interaction.user.tag}: ${reason ?? 'no reason given'}`, REASON_MAX);
}

const ban = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a member from the server')
    .addUserOption((option) => option.setName('user').setDescription('Who to ban').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(false).setMaxLength(REASON_MAX))
    .addIntegerOption((option) =>
      option.setName('delete_messages').setDescription('Delete their recent messages (days)').setRequired(false).setMinValue(0).setMaxValue(7),
    )
    .addBooleanOption((option) => option.setName('notify').setDescription('DM them the reason first').setRequired(false)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });

    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.BanMembers], { label: 'ban members' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const botCheck = guardBot(interaction.guild, [PermissionFlagsBits.BanMembers]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const targetCheck = await guardTarget(interaction, interaction.options.getUser('user').id, { action: 'ban' });
    if (!targetCheck.ok) return interaction.reply({ embeds: [errorEmbed('Blocked by Discord', targetCheck.message)], flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const target = targetCheck.target;
    const reason = reasonFor(interaction, interaction.options.getString('reason'));
    const days = interaction.options.getInteger('delete_messages') ?? 0;
    const notify = interaction.options.getBoolean('notify') ?? false;

    if (notify) {
      await target.user
        .send({ embeds: [errorEmbed(`You were banned from ${guild.name}`, reason)] })
        .catch(() => null);
    }

    try {
      await guild.members.ban(target.id, { deleteMessageSeconds: days * 86_400, reason });
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Discord refused the ban', error.message)], flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
      embeds: [
        modEmbed('Member banned', null, [
          { name: 'Target', value: `${target.user.tag} (\`${target.id}\`)`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Messages deleted', value: days ? `${days} day(s)` : 'none', inline: true },
          { name: 'Reason', value: reason, inline: false },
        ]),
      ],
      allowedMentions: { parse: [] },
    });

    await logModerationAction(guild, { action: 'Ban', moderator: interaction.user, target: target.user, reason });
  },
};

const unban = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Lift a ban using a user ID')
    .addStringOption((option) => option.setName('user_id').setDescription('The banned user ID').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(false).setMaxLength(REASON_MAX)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });

    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.BanMembers], { label: 'unban members' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const botCheck = guardBot(interaction.guild, [PermissionFlagsBits.BanMembers]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const userId = interaction.options.getString('user_id').trim();
    if (!/^\d{15,25}$/.test(userId)) {
      return interaction.reply({ embeds: [errorEmbed('Invalid user ID', 'That does not look like a Discord user ID.')], flags: MessageFlags.Ephemeral });
    }

    const existing = await guild.bans.fetch(userId).catch(() => null);
    if (!existing) {
      return interaction.reply({ embeds: [errorEmbed('Not banned', `<@${userId}> is not banned from this server.`)], flags: MessageFlags.Ephemeral });
    }

    const reason = reasonFor(interaction, interaction.options.getString('reason'));

    try {
      await guild.bans.remove(userId, reason);
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Discord refused the unban', error.message)], flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
      embeds: [
        modEmbed('Member unbanned', null, [
          { name: 'User', value: `${existing.user.tag} (\`${userId}\`)`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
        ]),
      ],
      allowedMentions: { parse: [] },
    });

    await logModerationAction(guild, { action: 'Unban', moderator: interaction.user, target: existing.user, reason });
  },
};

const softban = {
  data: new SlashCommandBuilder()
    .setName('softban')
    .setDescription('Ban then immediately unban, wiping their recent messages')
    .addUserOption((option) => option.setName('user').setDescription('Who to softban').setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(false).setMaxLength(REASON_MAX)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });

    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.BanMembers], { label: 'softban members' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const botCheck = guardBot(interaction.guild, [PermissionFlagsBits.BanMembers]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const targetCheck = await guardTarget(interaction, interaction.options.getUser('user').id, { action: 'softban' });
    if (!targetCheck.ok) return interaction.reply({ embeds: [errorEmbed('Blocked by Discord', targetCheck.message)], flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    const target = targetCheck.target;
    const reason = reasonFor(interaction, interaction.options.getString('reason'));

    try {
      await guild.members.ban(target.id, { deleteMessageSeconds: 604_800, reason: `[softban] ${reason}` });
      await guild.bans.remove(target.id, `[softban] ${reason}`);
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Discord refused the softban', error.message)], flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
      embeds: [
        modEmbed('Member softbanned', 'Banned and instantly unbanned so their recent messages were removed.', [
          { name: 'Target', value: `${target.user.tag} (\`${target.id}\`)`, inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: false },
        ]),
      ],
      allowedMentions: { parse: [] },
    });

    await logModerationAction(guild, { action: 'Softban', moderator: interaction.user, target: target.user, reason });
  },
};

export default [ban, unban, softban];
