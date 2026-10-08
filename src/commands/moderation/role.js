import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { errorEmbed, modEmbed, warningEmbed } from '../../utils/embeds.js';
import { guardBot, guardGuild, guardInvoker, guardInvokerRole, guardTarget } from '../../utils/permissions.js';
import { logModerationAction } from '../../services/logs.js';

/** Assignable roles sorted from highest to lowest, ignoring managed roles and @everyone. */
function assignableRoles(guild) {
  return [...guild.roles.cache.values()]
    .filter((role) => role.id !== guild.roles.everyone.id && !role.managed)
    .sort((a, b) => b.position - a.position);
}

async function changeRole(interaction, { member, role, add }) {
  try {
    if (add) await member.roles.add(role, `${interaction.user.tag} added the role`);
    else await member.roles.remove(role, `${interaction.user.tag} removed the role`);
    return null;
  } catch (error) {
    return error.message;
  }
}

const role = {
  data: new SlashCommandBuilder()
    .setName('role')
    .setDescription('Add or remove a role from a member')
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Give a role to a member')
        .addUserOption((option) => option.setName('user').setDescription('Who').setRequired(true))
        .addRoleOption((option) => option.setName('role').setDescription('Which role').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Take a role away from a member')
        .addUserOption((option) => option.setName('user').setDescription('Who').setRequired(true))
        .addRoleOption((option) => option.setName('role').setDescription('Which role').setRequired(true)),
    ),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });

    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageRoles], { label: 'manage roles' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const botCheck = guardBot(interaction.guild, [PermissionFlagsBits.ManageRoles]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const add = interaction.options.getSubcommand() === 'add';
    const targetCheck = await guardTarget(interaction, interaction.options.getUser('user').id, { action: 'change roles for' });
    if (!targetCheck.ok) return interaction.reply({ embeds: [errorEmbed('Blocked by Discord', targetCheck.message)], flags: MessageFlags.Ephemeral });

    const roleOption = interaction.options.getRole('role');
    const roleCheck = guardInvokerRole(interaction, roleOption);
    if (!roleCheck.ok) return interaction.reply({ embeds: [errorEmbed('Blocked by Discord', roleCheck.message)], flags: MessageFlags.Ephemeral });

    const member = targetCheck.target;
    if (add && member.roles.cache.has(roleOption.id)) {
      return interaction.reply({ embeds: [warningEmbed('Already assigned', `${member.user.tag} already has **${roleOption.name}**.`)], flags: MessageFlags.Ephemeral });
    }
    if (!add && !member.roles.cache.has(roleOption.id)) {
      return interaction.reply({ embeds: [warningEmbed('Not assigned', `${member.user.tag} does not have **${roleOption.name}**.`)], flags: MessageFlags.Ephemeral });
    }

    const failure = await changeRole(interaction, { member, role: roleOption, add });
    if (failure) return interaction.reply({ embeds: [errorEmbed('Discord refused the change', failure)], flags: MessageFlags.Ephemeral });

    await interaction.reply({
      embeds: [
        modEmbed(add ? 'Role added' : 'Role removed', null, [
          { name: 'Member', value: `${member.user.tag}`, inline: true },
          { name: 'Role', value: roleOption.toString(), inline: true },
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
        ]),
      ],
      allowedMentions: { parse: [] },
    });

    await logModerationAction(interaction.guild, {
      action: add ? 'Role added' : 'Role removed',
      moderator: interaction.user,
      target: member.user,
      reason: roleOption.name,
    });
  },
};

/** Shared body for /promote and /demote: walk the role ladder one step. */
async function walkLadder(interaction, direction) {
  const guildCheck = guardGuild(interaction);
  if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });

  const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageRoles], { label: 'move members up or down the role ladder' });
  if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

  const botCheck = guardBot(interaction.guild, [PermissionFlagsBits.ManageRoles]);
  if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

  const targetCheck = await guardTarget(interaction, interaction.options.getUser('user').id, { action: direction === 'up' ? 'promote' : 'demote' });
  if (!targetCheck.ok) return interaction.reply({ embeds: [errorEmbed('Blocked by Discord', targetCheck.message)], flags: MessageFlags.Ephemeral });

  const member = targetCheck.target;
  const me = interaction.guild.members.me;
  const ladder = assignableRoles(interaction.guild).filter((candidate) => me.roles.highest.comparePositionTo(candidate) > 0);

  if (!ladder.length) {
    return interaction.reply({ embeds: [errorEmbed('No roles available', 'There is no assignable role below my highest role.')], flags: MessageFlags.Ephemeral });
  }

  const requested = interaction.options.getRole('role');
  let nextRole = requested;

  if (!nextRole) {
    const current = member.roles.highest.id === interaction.guild.roles.everyone.id ? null : member.roles.highest;
    const index = current ? ladder.findIndex((candidate) => candidate.id === current.id) : ladder.length;
    if (current && index === -1) {
      return interaction.reply({ embeds: [errorEmbed('Cannot move', `${member.user.tag}'s highest role is outside the ladder I can manage.`)], flags: MessageFlags.Ephemeral });
    }
    nextRole = direction === 'up' ? ladder[Math.max(index - 1, 0)] : ladder[Math.min((index === -1 ? ladder.length : index) + 1, ladder.length - 1)];
  }

  const roleCheck = guardInvokerRole(interaction, nextRole);
  if (!roleCheck.ok) return interaction.reply({ embeds: [errorEmbed('Blocked by Discord', roleCheck.message)], flags: MessageFlags.Ephemeral });

  if (member.roles.cache.has(nextRole.id)) {
    return interaction.reply({
      embeds: [warningEmbed('Already there', `${member.user.tag} already has **${nextRole.name}**.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const failure = await changeRole(interaction, { member, role: nextRole, add: true });
  if (failure) return interaction.reply({ embeds: [errorEmbed('Discord refused the change', failure)], flags: MessageFlags.Ephemeral });

  await interaction.reply({
    embeds: [
      modEmbed(direction === 'up' ? 'Member promoted' : 'Member demoted', null, [
        { name: 'Member', value: `${member.user.tag}`, inline: true },
        { name: 'Role', value: nextRole.toString(), inline: true },
        { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
      ]),
    ],
    allowedMentions: { parse: [] },
  });

  await logModerationAction(interaction.guild, {
    action: direction === 'up' ? 'Promote' : 'Demote',
    moderator: interaction.user,
    target: member.user,
    reason: `role → ${nextRole.name}`,
  });
}

const promote = {
  data: new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Move a member one role up (or give a specific role)')
    .addUserOption((option) => option.setName('user').setDescription('Who').setRequired(true))
    .addRoleOption((option) => option.setName('role').setDescription('Specific role (optional)').setRequired(false)),
  async run(interaction) {
    return walkLadder(interaction, 'up');
  },
};

const demote = {
  data: new SlashCommandBuilder()
    .setName('demote')
    .setDescription('Move a member one role down (or give a specific role)')
    .addUserOption((option) => option.setName('user').setDescription('Who').setRequired(true))
    .addRoleOption((option) => option.setName('role').setDescription('Specific role (optional)').setRequired(false)),
  async run(interaction) {
    return walkLadder(interaction, 'down');
  },
};

export default [role, promote, demote];
