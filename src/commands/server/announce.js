import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { database } from '../../database/index.js';
import { errorEmbed, successEmbed, webEmbed } from '../../utils/embeds.js';
import { truncate } from '../../utils/format.js';
import { guardBot, guardInvoker } from '../../utils/permissions.js';
import { sendLog } from '../../services/logs.js';

const announce = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Post a branded announcement')
    .addStringOption((option) => option.setName('title').setDescription('Headline').setRequired(true).setMaxLength(200))
    .addStringOption((option) => option.setName('message').setDescription('The announcement body').setRequired(true).setMaxLength(3500))
    .addChannelOption((option) => option.setName('channel').setDescription('Where to post (defaults to the announcement channel)').setRequired(false))
    .addStringOption((option) =>
      option
        .setName('mention')
        .setDescription('Who to ping')
        .setRequired(false)
        .addChoices({ name: 'nobody', value: 'none' }, { name: '@here', value: 'here' }, { name: '@everyone', value: 'everyone' }),
    ),
  async run(interaction) {
    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageMessages], { label: 'post announcements' });
    if (!invokerCheck.ok) {
      const guildLevel = guardInvoker(interaction, [PermissionFlagsBits.ManageGuild], { label: 'post announcements' });
      if (!guildLevel.ok) {
        return interaction.reply({ embeds: [errorEmbed('Missing permission', 'You need **Manage Messages** or **Manage Server** to announce.')], flags: MessageFlags.Ephemeral });
      }
    }

    const guild = interaction.guild;
    if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

    const botCheck = guardBot(guild, [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot post', botCheck.message)], flags: MessageFlags.Ephemeral });

    const settings = database.settings(guild.id);
    const channelId = interaction.options.getChannel('channel')?.id ?? settings.announcementChannelId ?? interaction.channelId;
    const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));

    if (!channel?.isTextBased?.()) {
      return interaction.reply({ embeds: [errorEmbed('Wrong channel', 'Pick a normal text channel.')], flags: MessageFlags.Ephemeral });
    }

    const mention = interaction.options.getString('mention') ?? 'none';
    const allow = { parse: [] };

    if (mention === 'everyone' || mention === 'here') {
      const me = guild.members.me;
      const canMention = me?.permissions.has(PermissionFlagsBits.MentionEveryone);
      const invokerCanMention = interaction.memberPermissions?.has(PermissionFlagsBits.MentionEveryone);
      if (!canMention || !invokerCanMention) {
        return interaction.reply({
          embeds: [errorEmbed('Cannot ping that', 'Both you and I need the **Mention Everyone** permission to ping @everyone / @here.')],
          flags: MessageFlags.Ephemeral,
        });
      }
      allow.parse = ['everyone'];
    }

    const content = mention === 'none' ? undefined : mention === 'here' ? '@here' : '@everyone';

    const message = await channel
      .send({
        content,
        embeds: [
          webEmbed({
            title: truncate(interaction.options.getString('title'), 250),
            description: interaction.options.getString('message'),
            color: brand.colors.primary,
            author: { name: `${brand.name} — announcement`, iconURL: interaction.client.user.displayAvatarURL({ size: 64 }) },
            footer: `${brand.footer} • by ${interaction.user.tag}`,
          }),
        ],
        allowedMentions: allow,
      })
      .catch(() => null);

    if (!message) {
      return interaction.reply({ embeds: [errorEmbed('Could not post', `I failed to post in <#${channel.id}> — check my permissions there.`)], flags: MessageFlags.Ephemeral });
    }

    await interaction.reply({
      embeds: [successEmbed('Announcement posted', `Live in <#${channel.id}>.`)],
      flags: MessageFlags.Ephemeral,
    });

    await sendLog(guild, {
      type: 'config',
      title: 'Announcement posted',
      description: `${truncate(interaction.options.getString('title'), 150)} → <#${channel.id}>`,
      fields: [{ name: 'Posted by', value: `<@${interaction.user.id}>`, inline: true }],
    });
  },
};

export default [announce];
