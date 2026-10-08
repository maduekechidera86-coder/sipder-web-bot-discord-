import { PermissionFlagsBits } from 'discord.js';

import { brand } from '../config/brand.js';

/**
 * Every permission and hierarchy check the bot makes lives here, so moderation
 * commands cannot forget one. Each helper returns { ok: true } or
 * { ok: false, message } — commands simply forward the message to the user.
 */

const LABELS = new Map(Object.entries(PermissionFlagsBits).map(([name, bit]) => [bit, name.replace(/([A-Z])/g, ' $1').replace(/^ /, '').trim()]));

export function permissionLabel(bit) {
  return LABELS.get(bit) ?? 'Unknown permission';
}

export function describePermissions(bits = []) {
  return bits.map(permissionLabel).join(', ');
}

export function guardGuild(interaction) {
  if (!interaction.guild) return { ok: false, message: 'This command only works inside a server.' };
  return { ok: true };
}

/** The invoker's own Discord permission. Administrators bypass Discord's checks. */
export function guardInvoker(interaction, bits = [], { label = 'that action' } = {}) {
  const missing = userMissingPermissions(interaction, bits);
  if (missing.length) {
    return {
      ok: false,
      message: `${brand.emoji.cross} You cannot ${label} — you are missing **${describePermissions(missing)}**.`,
    };
  }
  return { ok: true };
}

export function userMissingPermissions(interaction, bits = []) {
  const permissions = interaction.memberPermissions;
  if (!permissions || !interaction.guild) return [...bits];
  if (permissions.has(PermissionFlagsBits.Administrator)) return [];
  return bits.filter((bit) => !permissions.has(bit));
}

/** The bot's own permission — checked before touching anything. */
export function guardBot(guild, bits = []) {
  const me = guild?.members?.me;
  if (!me) return { ok: false, message: 'I am not in this server right now.' };
  const missing = botMissingPermissions(guild, bits);
  if (missing.length) {
    return {
      ok: false,
      message: `${brand.emoji.cross} I am missing **${describePermissions(missing)}** — grant it (or move my role higher) and try again.`,
    };
  }
  return { ok: true };
}

export function botMissingPermissions(guild, bits = []) {
  const me = guild?.members?.me;
  if (!me) return [...bits];
  if (me.permissions.has(PermissionFlagsBits.Administrator)) return [];
  return bits.filter((bit) => !me.permissions.has(bit));
}

/**
 * Can the bot move this role around? Discord refuses role edits above the bot's
 * own highest role and for integration-managed roles.
 */
export function guardRole(guild, role) {
  const me = guild?.members?.me;
  if (!role) return { ok: false, message: 'That role could not be found.' };
  if (!me) return { ok: false, message: 'I am not in this server right now.' };
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, message: `${brand.emoji.cross} I need the **Manage Roles** permission to do that.` };
  }
  if (role.id === guild.roles.everyone.id) {
    return { ok: false, message: 'That is the @everyone role — it cannot be handled like a normal role.' };
  }
  if (role.managed) {
    return { ok: false, message: `The role **${role.name}** is managed by an integration (a bot or boost role) — Discord will not let me change it.` };
  }
  if (me.roles.highest.comparePositionTo(role) <= 0) {
    return {
      ok: false,
      message: `${brand.emoji.cross} My highest role (**${me.roles.highest.name}**) sits below **${role.name}**. Drag my role above it in Server Settings → Roles.`,
    };
  }
  return { ok: true, role };
}

/**
 * Everything that must be true before moderating a member:
 * not the server owner, not me, not yourself, and my role above theirs.
 */
export async function guardTarget(interaction, userId, { allowSelf = false, allowBots = true, action = 'moderate' } = {}) {
  const guildCheck = guardGuild(interaction);
  if (!guildCheck.ok) return guildCheck;

  const guild = interaction.guild;
  const target = await guild.members.fetch(userId).catch(() => null);
  if (!target) return { ok: false, message: 'That member is not in this server.' };

  if (target.id === guild.ownerId) {
    return { ok: false, message: `${brand.emoji.crown} <@${target.id}> owns this server — Discord does not allow ${action}ing the owner.` };
  }
  if (target.id === interaction.client.user.id) {
    return { ok: false, message: 'I cannot use that on myself.' };
  }
  if (target.id === interaction.user.id && !allowSelf) {
    return { ok: false, message: `You cannot ${action} yourself.` };
  }
  if (target.user.bot && !allowBots) {
    return { ok: false, message: 'That is a bot account.' };
  }

  const me = guild.members.me;
  if (!me) return { ok: false, message: 'I am not in this server right now.' };

  if (me.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return {
      ok: false,
      message: `${brand.emoji.cross} My highest role (**${me.roles.highest.name}**) is not above **${target.user.tag}**'s highest role (**${target.roles.highest.name}**). Move my role higher in Server Settings → Roles.`,
    };
  }

  const invokerIsGuildOwner = interaction.user.id === guild.ownerId;
  if (!invokerIsGuildOwner && interaction.member.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return {
      ok: false,
      message: `${brand.emoji.cross} You cannot ${action} **${target.user.tag}** — your highest role is not above theirs, and Discord blocks that.`,
    };
  }

  return { ok: true, target };
}

/** Can the invoker assign/remove this role? (Hierarchy always applies to roles.) */
export function guardInvokerRole(interaction, role) {
  const roleCheck = guardRole(interaction.guild, role);
  if (!roleCheck.ok) return roleCheck;
  const invokerIsGuildOwner = interaction.user.id === interaction.guild.ownerId;
  if (!invokerIsGuildOwner && interaction.member.roles.highest.comparePositionTo(role) <= 0) {
    return { ok: false, message: `${brand.emoji.cross} **${role.name}** is not below your highest role, so Discord blocks you from managing it.` };
  }
  return { ok: true, role };
}

/** Owner gate used by the owner command category. */
export function guardOwner(userId, isOwner, { action = 'use this command' } = {}) {
  if (!isOwner) {
    return { ok: false, message: `${brand.emoji.crown} Only the bot owner (NIGHTMARE) can ${action}.` };
  }
  return { ok: true };
}

export default guardTarget;
