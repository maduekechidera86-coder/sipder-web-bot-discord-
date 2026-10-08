import { MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { database } from '../../database/index.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { guardBot, guardInvoker } from '../../utils/permissions.js';
import { sendLog } from '../../services/logs.js';

const setlog = {
  data: new SlashCommandBuilder()
    .setName('setlog')
    .setDescription('Choose where moderation and server logs are posted')
    .addChannelOption((option) => option.setName('channel').setDescription('The log channel').setRequired(false))
    .addBooleanOption((option) => option.setName('disable').setDescription('Turn logging off').setRequired(false)),
  async run(interaction) {
    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageGuild], { label: 'change the log channel' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

    const disable = interaction.options.getBoolean('disable') ?? false;
    const channel = interaction.options.getChannel('channel');

    if (disable) {
      database.updateGuild(guild.id, { settings: { modules: { logs: false } } });
      return interaction.reply({ embeds: [successEmbed('Logging disabled', 'Moderation actions will still be written to the internal audit trail, just not posted.')], flags: MessageFlags.Ephemeral });
    }

    if (!channel) {
      const current = database.settings(guild.id).logChannelId;
      return interaction.reply({
        embeds: [
          errorEmbed('Pick a channel', current ? `Logs currently go to <#${current}>. Pass \`channel\` to change it or \`disable:true\` to turn logging off.` : 'Pass a `channel` to send logs there, or `disable:true`.'),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!channel.isTextBased()) {
      return interaction.reply({ embeds: [errorEmbed('Wrong channel', 'Logs need a normal text channel.')], flags: MessageFlags.Ephemeral });
    }

    const botCheck = guardBot(guild, [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot log there', botCheck.message)], flags: MessageFlags.Ephemeral });

    if (!channel.permissionsFor(guild.members.me)?.has(PermissionFlagsBits.SendMessages)) {
      return interaction.reply({
        embeds: [errorEmbed('No permission there', `I cannot send messages in <#${channel.id}> — grant me **Send Messages**.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    database.updateGuild(guild.id, { settings: { logChannelId: channel.id, modules: { logs: true } } });

    await sendLog(guild, {
      type: 'config',
      title: 'Log channel set',
      description: `Logs will be posted here from now on.`,
      fields: [{ name: 'Changed by', value: `<@${interaction.user.id}>`, inline: true }],
    });

    return interaction.reply({
      embeds: [successEmbed('Log channel saved', `Moderation, member and configuration logs now go to <#${channel.id}>.`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default [setlog];
