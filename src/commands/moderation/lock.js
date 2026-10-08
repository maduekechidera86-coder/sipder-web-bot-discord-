import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { errorEmbed, modEmbed, progressBar } from '../../utils/embeds.js';
import { guardBot, guardGuild, guardInvoker } from '../../utils/permissions.js';
import { sendLog } from '../../services/logs.js';

async function setLock(guild, channel, locked, reason) {
  await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: locked ? false : null }, { reason });
}

function lockable(channel, me) {
  if (!channel.isTextBased() || channel.type === ChannelType.GuildVoice) return false;
  const permissions = channel.permissionsFor(me);
  return Boolean(permissions?.has(PermissionFlagsBits.ManageChannels));
}

const lock = {
  data: new SlashCommandBuilder()
    .setName('lock')
    .setDescription('Lock a channel so nobody can talk')
    .addChannelOption((option) => option.setName('channel').setDescription('Which channel (defaults to this one)').setRequired(false))
    .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(false).setMaxLength(200)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });
    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageChannels], { label: 'lock channels' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });
    const botCheck = guardBot(interaction.guild, [PermissionFlagsBits.ManageChannels]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    if (!channel?.isTextBased?.()) {
      return interaction.reply({ embeds: [errorEmbed('Wrong channel type', 'Only text channels can be locked.')], flags: MessageFlags.Ephemeral });
    }

    const reason = interaction.options.getString('reason') ?? `${interaction.user.tag} locked the channel`;

    try {
      await setLock(interaction.guild, channel, true, reason);
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Discord refused the change', error.message)], flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
      embeds: [
        modEmbed('Channel locked', `${brand.emoji.spider} <#${channel.id}> is now read-only.`, [
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: true },
        ]),
      ],
    });

    await sendLog(interaction.guild, {
      type: 'moderation',
      title: 'Channel locked',
      description: `<#${channel.id}> · ${reason}`,
      fields: [{ name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true }],
    });
  },
};

const unlock = {
  data: new SlashCommandBuilder()
    .setName('unlock')
    .setDescription('Unlock a channel again')
    .addChannelOption((option) => option.setName('channel').setDescription('Which channel (defaults to this one)').setRequired(false))
    .addStringOption((option) => option.setName('reason').setDescription('Why').setRequired(false).setMaxLength(200)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });
    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageChannels], { label: 'unlock channels' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });
    const botCheck = guardBot(interaction.guild, [PermissionFlagsBits.ManageChannels]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const channel = interaction.options.getChannel('channel') ?? interaction.channel;
    if (!channel?.isTextBased?.()) {
      return interaction.reply({ embeds: [errorEmbed('Wrong channel type', 'Only text channels can be unlocked.')], flags: MessageFlags.Ephemeral });
    }

    const reason = interaction.options.getString('reason') ?? `${interaction.user.tag} unlocked the channel`;

    try {
      await setLock(interaction.guild, channel, false, reason);
    } catch (error) {
      return interaction.reply({ embeds: [errorEmbed('Discord refused the change', error.message)], flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
      embeds: [
        modEmbed('Channel unlocked', `The web breathes again in <#${channel.id}>.`, [
          { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Reason', value: reason, inline: true },
        ]),
      ],
    });

    await sendLog(interaction.guild, {
      type: 'moderation',
      title: 'Channel unlocked',
      description: `<#${channel.id}> · ${reason}`,
      fields: [{ name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true }],
    });
  },
};

async function lockAll(interaction, locked) {
  const guildCheck = guardGuild(interaction);
  if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });
  const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageChannels], { label: 'lock channels' });
  if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  const botCheck = guardBot(guild, [PermissionFlagsBits.ManageChannels]);
  if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

  await interaction.deferReply();

  const me = guild.members.me;
  const targets = guild.channels.cache.filter((channel) => lockable(channel, me));
  const reason = `${interaction.user.tag} ${locked ? 'locked' : 'unlocked'} every channel`;

  let done = 0;
  const failed = [];
  const entries = [...targets.values()].sort((a, b) => a.rawPosition - b.rawPosition);

  for (const channel of entries) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await setLock(guild, channel, locked, reason);
      done += 1;
    } catch (error) {
      failed.push(`${channel.name}: ${error.message}`);
    }

    if (done % 5 === 0 || done === entries.length) {
      // eslint-disable-next-line no-await-in-loop
      await interaction
        .editReply({
          embeds: [
            modEmbed(locked ? 'Locking the web…' : 'Unlocking the web…', `${progressBar(done, entries.length)} ${done}/${entries.length} channels`, []),
          ],
        })
        .catch(() => null);
    }
  }

  return interaction.editReply({
    embeds: [
      modEmbed(locked ? 'All channels locked' : 'All channels unlocked', null, [
        { name: 'Changed', value: `${done} channel(s)`, inline: true },
        { name: 'Skipped', value: `${entries.length - done - failed.length} (voice or no permission)`, inline: true },
        { name: 'Failed', value: failed.length ? failed.slice(0, 5).join('\n') : 'none', inline: false },
      ]),
    ],
  });
}

const lockall = {
  data: new SlashCommandBuilder().setName('lockall').setDescription('Lock every text channel in the server'),
  async run(interaction) {
    await lockAll(interaction, true);
    await sendLog(interaction.guild, {
      type: 'moderation',
      title: 'Server lockdown',
      fields: [{ name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true }],
    });
  },
};

const unlockall = {
  data: new SlashCommandBuilder().setName('unlockall').setDescription('Unlock every text channel in the server'),
  async run(interaction) {
    await lockAll(interaction, false);
    await sendLog(interaction.guild, {
      type: 'moderation',
      title: 'Server unlocked',
      fields: [{ name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true }],
    });
  },
};

export default [lock, unlock, lockall, unlockall];
