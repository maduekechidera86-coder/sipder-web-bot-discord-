import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { errorEmbed, modEmbed, successEmbed } from '../../utils/embeds.js';
import { describePermissions, guardBot, guardInvoker, guardRole } from '../../utils/permissions.js';
import { sendLog } from '../../services/logs.js';

const channel = {
  data: new SlashCommandBuilder()
    .setName('channel')
    .setDescription('Create, rename or delete a channel')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a channel')
        .addStringOption((option) => option.setName('name').setDescription('Channel name').setRequired(true).setMaxLength(90))
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('Channel kind')
            .setRequired(false)
            .addChoices({ name: 'text', value: 'text' }, { name: 'voice', value: 'voice' }, { name: 'announcement', value: 'announcement' }),
        )
        .addChannelOption((option) => option.setName('parent').setDescription('Category to place it in').setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('rename')
        .setDescription('Rename a channel')
        .addChannelOption((option) => option.setName('channel').setDescription('Which channel').setRequired(true))
        .addStringOption((option) => option.setName('name').setDescription('New name').setRequired(true).setMaxLength(90)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a channel')
        .addChannelOption((option) => option.setName('channel').setDescription('Which channel').setRequired(true)),
    ),
  async run(interaction) {
    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageChannels], { label: 'manage channels' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

    const botCheck = guardBot(guild, [PermissionFlagsBits.ManageChannels]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      const name = interaction.options.getString('name');
      const type = interaction.options.getString('type') ?? 'text';
      const parent = interaction.options.getChannel('parent');

      const types = { text: ChannelType.GuildText, voice: ChannelType.GuildVoice, announcement: ChannelType.GuildAnnouncement };

      try {
        const created = await guild.channels.create({
          name,
          type: types[type],
          parent: parent?.type === ChannelType.GuildCategory ? parent.id : null,
          reason: `${interaction.user.tag} created the channel`,
        });
        return interaction.reply({
          embeds: [successEmbed('Channel created', `**${created.name}** → <#${created.id}>${parent ? ` in **${parent.name}**` : ''}`)],
        });
      } catch (error) {
        return interaction.reply({ embeds: [errorEmbed('Discord refused the creation', error.message)], flags: MessageFlags.Ephemeral });
      }
    }

    const target = interaction.options.getChannel('channel');

    if (subcommand === 'rename') {
      const name = interaction.options.getString('name');
      try {
        const before = target.name;
        await target.setName(name, `${interaction.user.tag} renamed the channel`);
        return interaction.reply({ embeds: [successEmbed('Channel renamed', `**${before}** → **${target.name}**`)] });
      } catch (error) {
        return interaction.reply({ embeds: [errorEmbed('Discord refused the rename', error.message)], flags: MessageFlags.Ephemeral });
      }
    }

    if (target.id === interaction.channelId || target.type === ChannelType.GuildCategory) {
      return interaction.reply({
        embeds: [errorEmbed('Refused', target.type === ChannelType.GuildCategory ? 'That is a category — use `/category delete`.' : 'I will not delete the channel this command was run in.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    try {
      const name = target.name;
      await target.delete(`${interaction.user.tag} deleted the channel`);
      await interaction.reply({ embeds: [modEmbed('Channel deleted', `**${name}** is gone.`)] });
      await sendLog(guild, {
        type: 'server',
        title: 'Channel deleted',
        description: `**${name}**`,
        fields: [{ name: 'By', value: `<@${interaction.user.id}>`, inline: true }],
      });
      return true;
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Discord refused the deletion', error.message)], flags: MessageFlags.Ephemeral });
    }
  },
};

const category = {
  data: new SlashCommandBuilder()
    .setName('category')
    .setDescription('Create or delete a category')
    .addSubcommand((sub) =>
      sub
        .setName('create')
        .setDescription('Create a category')
        .addStringOption((option) => option.setName('name').setDescription('Category name').setRequired(true).setMaxLength(90)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('delete')
        .setDescription('Delete a category (its channels are kept)')
        .addChannelOption((option) => option.setName('category').setDescription('Which category').setRequired(true)),
    ),
  async run(interaction) {
    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageChannels], { label: 'manage categories' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

    const botCheck = guardBot(guild, [PermissionFlagsBits.ManageChannels]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      try {
        const created = await guild.channels.create({
          name: interaction.options.getString('name'),
          type: ChannelType.GuildCategory,
          reason: `${interaction.user.tag} created the category`,
        });
        return interaction.reply({ embeds: [successEmbed('Category created', `**${created.name}**`) ] });
      } catch (error) {
        return interaction.reply({ embeds: [errorEmbed('Discord refused the creation', error.message)], flags: MessageFlags.Ephemeral });
      }
    }

    const target = interaction.options.getChannel('category');
    if (target.type !== ChannelType.GuildCategory) {
      return interaction.reply({ embeds: [errorEmbed('Not a category', 'Pick a category, not a channel.')], flags: MessageFlags.Ephemeral });
    }

    try {
      const name = target.name;
      await target.delete(`${interaction.user.tag} deleted the category`);
      return interaction.reply({ embeds: [modEmbed('Category deleted', `**${name}** was removed — its channels were kept.`)] });
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Discord refused the deletion', error.message)], flags: MessageFlags.Ephemeral });
    }
  },
};

const ROLE_PRESETS = {
  none: [],
  moderator: [
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ManageNicknames,
    PermissionFlagsBits.ViewAuditLog,
  ],
  admin: [
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ManageNicknames,
    PermissionFlagsBits.ViewAuditLog,
  ],
};

const createrole = {
  data: new SlashCommandBuilder()
    .setName('createrole')
    .setDescription('Create a role with a colour and a permission preset')
    .addStringOption((option) => option.setName('name').setDescription('Role name').setRequired(true).setMaxLength(90))
    .addStringOption((option) => option.setName('color').setDescription('Hex colour, e.g. #b1121f').setRequired(false))
    .addStringOption((option) =>
      option
        .setName('preset')
        .setDescription('Permission preset')
        .setRequired(false)
        .addChoices({ name: 'none', value: 'none' }, { name: 'moderator', value: 'moderator' }, { name: 'admin', value: 'admin' }),
    )
    .addBooleanOption((option) => option.setName('hoist').setDescription('Show separately in the member list').setRequired(false))
    .addBooleanOption((option) => option.setName('mentionable').setDescription('Allow anyone to mention it').setRequired(false)),
  async run(interaction) {
    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageRoles], { label: 'create roles' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

    const botCheck = guardBot(guild, [PermissionFlagsBits.ManageRoles]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const rawColor = interaction.options.getString('color');
    let color = 0xb1121f;
    if (rawColor) {
      const parsed = Number.parseInt(rawColor.replace('#', ''), 16);
      if (Number.isNaN(parsed) || !/^#?[0-9a-fA-F]{6}$/.test(rawColor.trim())) {
        return interaction.reply({ embeds: [errorEmbed('Bad colour', 'Use a 6-digit hex colour such as `#b1121f`.')], flags: MessageFlags.Ephemeral });
      }
      color = parsed;
    }

    const preset = interaction.options.getString('preset') ?? 'none';
    const presetPermissions = ROLE_PRESETS[preset];
    const invokerIsGuildOwner = interaction.user.id === guild.ownerId;

    // Refuse to hand out permissions the invoker does not have themselves.
    if (!invokerIsGuildOwner) {
      const missing = presetPermissions.filter((bit) => !interaction.memberPermissions.has(bit));
      if (missing.length) {
        return interaction.reply({
          embeds: [errorEmbed('Too powerful', `The **${preset}** preset includes permissions you do not have: **${describePermissions(missing)}**.`)],
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    try {
      const role = await guild.roles.create({
        name: interaction.options.getString('name'),
        colors: { primaryColor: color },
        hoist: interaction.options.getBoolean('hoist') ?? false,
        mentionable: interaction.options.getBoolean('mentionable') ?? false,
        permissions: presetPermissions,
        reason: `${interaction.user.tag} created the role`,
      });

      await sendLog(guild, {
        type: 'server',
        title: 'Role created',
        description: `${role.toString()} · preset \`${preset}\``,
        fields: [{ name: 'By', value: `<@${interaction.user.id}>`, inline: true }],
      });

      return interaction.reply({
        embeds: [successEmbed('Role created', null, [
          { name: 'Role', value: role.toString(), inline: true },
          { name: 'Preset', value: preset, inline: true },
          { name: 'Colour', value: `#${color.toString(16).padStart(6, '0')}`, inline: true },
        ])],
      });
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Discord refused the creation', error.message)], flags: MessageFlags.Ephemeral });
    }
  },
};

const deleterole = {
  data: new SlashCommandBuilder()
    .setName('deleterole')
    .setDescription('Delete a role (requires confirm:true)')
    .addRoleOption((option) => option.setName('role').setDescription('Which role').setRequired(true))
    .addBooleanOption((option) => option.setName('confirm').setDescription('Set true to really delete it').setRequired(true)),
  async run(interaction) {
    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageRoles], { label: 'delete roles' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

    if (!interaction.options.getBoolean('confirm')) {
      return interaction.reply({
        embeds: [errorEmbed('Not confirmed', 'Deleting a role is permanent — run the command again with `confirm:true`.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    const botCheck = guardBot(guild, [PermissionFlagsBits.ManageRoles]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const role = interaction.options.getRole('role');
    const roleCheck = guardRole(guild, role);
    if (!roleCheck.ok) return interaction.reply({ embeds: [errorEmbed('Blocked by Discord', roleCheck.message)], flags: MessageFlags.Ephemeral });

    const invokerIsGuildOwner = interaction.user.id === guild.ownerId;
    if (!invokerIsGuildOwner && interaction.member.roles.highest.comparePositionTo(role) <= 0) {
      return interaction.reply({ embeds: [errorEmbed('Blocked by Discord', `**${role.name}** is not below your highest role.`)], flags: MessageFlags.Ephemeral });
    }

    const members = role.members.size;
    try {
      const name = role.name;
      await role.delete(`${interaction.user.tag} deleted the role`);
      await interaction.reply({
        embeds: [modEmbed('Role deleted', `**${name}** removed from ${members} member(s).`)],
      });
      await sendLog(guild, {
        type: 'server',
        title: 'Role deleted',
        description: `**${name}** (${members} member(s))`,
        fields: [{ name: 'By', value: `<@${interaction.user.id}>`, inline: true }],
      });
      return true;
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Discord refused the deletion', error.message)], flags: MessageFlags.Ephemeral });
    }
  },
};

export default [channel, category, createrole, deleterole];
