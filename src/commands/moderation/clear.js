import { ChannelType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { errorEmbed, modEmbed, warningEmbed } from '../../utils/embeds.js';
import { truncate } from '../../utils/format.js';
import { guardBot, guardGuild, guardInvoker } from '../../utils/permissions.js';
import { sendLog } from '../../services/logs.js';

const TWO_WEEKS = 14 * 86_400_000;
const LINK_PATTERN = /(https?:\/\/|www\.|discord\.gg\/)/i;

/** Fetches up to `amount` messages and filters out anything Discord cannot bulk-delete. */
async function collectDeletable(channel, amount, predicate) {
  const fetched = await channel.messages.fetch({ limit: Math.min(Math.max(amount, 1), 100) });
  const deletable = fetched.filter((message) => {
    if (message.createdTimestamp <= Date.now() - TWO_WEEKS) return false;
    return predicate ? predicate(message) : true;
  });
  return { fetched, deletable, skipped: fetched.size - deletable.size };
}

async function runClear(interaction, { amount, predicate, label, describe }) {
  const channel = interaction.channel;
  if (!channel || !channel.isTextBased() || channel.type === ChannelType.GuildStageVoice) {
    return interaction.reply({ embeds: [errorEmbed('Not here', 'This command needs a normal text channel.')], flags: MessageFlags.Ephemeral });
  }

  const botCheck = guardBot(interaction.guild, [PermissionFlagsBits.ManageMessages]);
  if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { fetched, deletable, skipped } = await collectDeletable(channel, amount, predicate);

  if (!deletable.size) {
    return interaction.editReply({
      embeds: [
        warningEmbed(
          'Nothing to delete',
          skipped
            ? `${skipped} message(s) matched but are older than 14 days — Discord does not allow bulk deletion of those.`
            : 'No messages matched.',
        ),
      ],
    });
  }

  const deleted = await channel.bulkDelete(deletable, true).catch(() => null);
  if (!deleted) {
    return interaction.editReply({ embeds: [errorEmbed('Discord refused the deletion', 'Messages older than 14 days cannot be bulk deleted.')] });
  }

  await interaction.editReply({
    embeds: [
      modEmbed(label, null, [
        { name: 'Channel', value: `<#${channel.id}>`, inline: true },
        { name: 'Deleted', value: `${deleted.size}`, inline: true },
        { name: 'Skipped', value: `${skipped}`, inline: true },
        { name: 'Filter', value: describe, inline: false },
      ]),
    ],
  });

  await sendLog(interaction.guild, {
    type: 'moderation',
    title: label,
    description: describe,
    fields: [
      { name: 'Moderator', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Channel', value: `<#${channel.id}>`, inline: true },
      { name: 'Deleted', value: `${deleted.size} of ${fetched.size} fetched`, inline: true },
    ],
  });
}

const clear = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Delete recent messages in this channel (max 100)')
    .addIntegerOption((option) => option.setName('amount').setDescription('How many messages (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });
    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageMessages], { label: 'delete messages' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    return runClear(interaction, {
      amount: interaction.options.getInteger('amount'),
      predicate: null,
      label: 'Messages cleared',
      describe: 'all recent messages',
    });
  },
};

const purge = {
  data: new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete recent messages, optionally only from one member')
    .addIntegerOption((option) => option.setName('amount').setDescription('How many to scan (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption((option) => option.setName('user').setDescription('Only this member’s messages').setRequired(false)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });
    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageMessages], { label: 'purge messages' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const user = interaction.options.getUser('user');
    return runClear(interaction, {
      amount: interaction.options.getInteger('amount'),
      predicate: user ? (message) => message.author.id === user.id : null,
      label: 'Messages purged',
      describe: user ? `messages from ${user.tag}` : 'all recent messages',
    });
  },
};

const cleanup = {
  data: new SlashCommandBuilder()
    .setName('cleanup')
    .setDescription('Delete only a kind of message (bots, links, embeds, images, attachments)')
    .addStringOption((option) =>
      option
        .setName('filter')
        .setDescription('What to remove')
        .setRequired(true)
        .addChoices(
          { name: 'Bot messages', value: 'bots' },
          { name: 'Messages containing links', value: 'links' },
          { name: 'Messages with embeds', value: 'embeds' },
          { name: 'Messages with images', value: 'images' },
          { name: 'Messages with attachments', value: 'attachments' },
          { name: 'Messages mentioning everyone', value: 'mentions' },
        ),
    )
    .addIntegerOption((option) => option.setName('amount').setDescription('How many to scan (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)),
  async run(interaction) {
    const guildCheck = guardGuild(interaction);
    if (!guildCheck.ok) return interaction.reply({ embeds: [errorEmbed('Server only', guildCheck.message)], flags: MessageFlags.Ephemeral });
    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageMessages], { label: 'clean up messages' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const filter = interaction.options.getString('filter');
    const predicates = {
      bots: (message) => message.author.bot,
      links: (message) => LINK_PATTERN.test(message.content),
      embeds: (message) => message.embeds.length > 0,
      images: (message) => message.attachments.some((attachment) => attachment.contentType?.startsWith('image/')),
      attachments: (message) => message.attachments.size > 0,
      mentions: (message) => message.mentions.everyone,
    };

    return runClear(interaction, {
      amount: interaction.options.getInteger('amount'),
      predicate: predicates[filter],
      label: 'Channel cleaned up',
      describe: truncate(`messages matching \`${filter}\``, 200),
    });
  },
};

export default [clear, purge, cleanup];
