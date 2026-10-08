import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { database } from '../../database/index.js';
import { errorEmbed, infoEmbed } from '../../utils/embeds.js';
import { truncate } from '../../utils/format.js';
import { guardBot, guardInvoker } from '../../utils/permissions.js';
import { sendLog } from '../../services/logs.js';

const PLACEHOLDER_HELP = 'Placeholders: `{user}` `{tag}` `{server}` `{membercount}` `{name}`';

async function saveMessageChannel(interaction, { channelKey, messageKey, label }) {
  const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageGuild], { label: 'change server settings' });
  if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

  const guild = interaction.guild;
  if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

  const botCheck = guardBot(guild, [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
  if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot send there', botCheck.message)], flags: MessageFlags.Ephemeral });

  const channel = interaction.options.getChannel('channel');
  if (!channel?.isTextBased?.()) {
    return interaction.reply({ embeds: [errorEmbed('Wrong channel', 'Pick a normal text channel.')], flags: MessageFlags.Ephemeral });
  }

  const canPost = channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages);
  if (!canPost) {
    return interaction.reply({
      embeds: [errorEmbed('No permission there', `I cannot send messages in <#${channel.id}> — grant me **Send Messages** first.`)],
      flags: MessageFlags.Ephemeral,
    });
  }

  const message = interaction.options.getString('message');
  database.updateGuild(guild.id, { settings: { [channelKey]: channel.id, ...(message ? { [messageKey]: message } : {}) } });

  await sendLog(guild, {
    type: 'config',
    title: `${label} configuration changed`,
    description: `${label} → <#${channel.id}>${message ? '\nCustom text saved.' : ''}`,
    fields: [{ name: 'Changed by', value: `<@${interaction.user.id}>`, inline: true }],
  });

  return interaction.reply({
    embeds: [
      infoEmbed(`${label} updated`, `${label} will be posted in <#${channel.id}>.${message ? `\n\n**Custom text:**\n${truncate(message, 600)}` : ''}`, [
        { name: 'Placeholders', value: PLACEHOLDER_HELP, inline: false },
        { name: 'Turn it off', value: `\`/config toggle module:${channelKey === 'welcomeChannelId' ? 'welcome' : 'goodbye'} enabled:false\``, inline: false },
      ]),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

const setwelcome = {
  data: new SlashCommandBuilder()
    .setName('setwelcome')
    .setDescription('Choose where new members are welcomed (and optionally the text)')
    .addChannelOption((option) => option.setName('channel').setDescription('Welcome channel').setRequired(true))
    .addStringOption((option) => option.setName('message').setDescription('Custom welcome text (optional)').setRequired(false).setMaxLength(1500)),
  async run(interaction) {
    return saveMessageChannel(interaction, { channelKey: 'welcomeChannelId', messageKey: 'welcomeMessage', label: 'Welcome message' });
  },
};

const setgoodbye = {
  data: new SlashCommandBuilder()
    .setName('setgoodbye')
    .setDescription('Choose where leaving members are announced (and optionally the text)')
    .addChannelOption((option) => option.setName('channel').setDescription('Goodbye channel').setRequired(true))
    .addStringOption((option) => option.setName('message').setDescription('Custom goodbye text (optional)').setRequired(false).setMaxLength(1500)),
  async run(interaction) {
    return saveMessageChannel(interaction, { channelKey: 'goodbyeChannelId', messageKey: 'goodbyeMessage', label: 'Goodbye message' });
  },
};

export default [setwelcome, setgoodbye];
