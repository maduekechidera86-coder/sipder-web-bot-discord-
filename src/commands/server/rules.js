import { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { BLUEPRINT } from '../../config/serverBlueprint.js';
import { database } from '../../database/index.js';
import { sendLog } from '../../services/logs.js';
import { errorEmbed, infoEmbed, successEmbed, webEmbed } from '../../utils/embeds.js';
import { truncate } from '../../utils/format.js';
import { logger } from '../../utils/logger.js';
import { guardBot, guardInvoker, guardRole } from '../../utils/permissions.js';

export const VERIFY_BUTTON_PREFIX = 'web:verify';

function verifyComponents(roleId) {
  const verifyButton = new ButtonBuilder()
    .setCustomId(`${VERIFY_BUTTON_PREFIX}:${roleId}`)
    .setLabel(BLUEPRINT.messages.verifyButton)
    .setEmoji('✅')
    .setStyle(ButtonStyle.Success);

  return [new ActionRowBuilder().addComponents(verifyButton)];
}

/** Called from the interaction router when someone presses the verify button. */
export async function handleVerifyButton(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ embeds: [errorEmbed('Server only', 'Verification only works inside a server.')], flags: MessageFlags.Ephemeral });
  }

  try {
    const [, , roleIdFromButton] = interaction.customId.split(':');
    const roleId = roleIdFromButton || database.settings(guild.id).verifyRoleId;

    if (!roleId) {
      return interaction.reply({ embeds: [errorEmbed('Not configured', 'No verification role is set — an admin can run `/setverify`.')], flags: MessageFlags.Ephemeral });
    }

    const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null));
    const roleCheck = guardRole(guild, role);
    if (!roleCheck.ok) {
      return interaction.reply({ embeds: [errorEmbed('Cannot verify right now', roleCheck.message)], flags: MessageFlags.Ephemeral });
    }

    if (interaction.member.roles.cache.has(role.id)) {
      return interaction.reply({ embeds: [infoEmbed('Already verified', `You already hold ${role.toString()}.`)], flags: MessageFlags.Ephemeral });
    }

    await interaction.member.roles.add(role, `${brand.short} verification`);

    await interaction.reply({
      embeds: [successEmbed('Verified', `You now hold ${role.toString()} — welcome to the web, <@${interaction.user.id}>.`)],
      flags: MessageFlags.Ephemeral,
    });

    await sendLog(guild, {
      type: 'security',
      title: 'Member verified',
      description: `<@${interaction.user.id}> (${interaction.user.tag})`,
      fields: [{ name: 'Role granted', value: role.name, inline: true }],
    });

    return true;
  } catch (error) {
    logger.error(`Verify button failed: ${error.message}`);
    return interaction
      .reply({ embeds: [errorEmbed('Verification failed', 'Discord refused the role change — ask an admin to check my role position.')], flags: MessageFlags.Ephemeral })
      .catch(() => null);
  }
}

const setrules = {
  data: new SlashCommandBuilder()
    .setName('setrules')
    .setDescription('Post a clean, branded rules message and keep a record of it')
    .addStringOption((option) => option.setName('body').setDescription('The rules text').setRequired(true).setMaxLength(4000))
    .addChannelOption((option) => option.setName('channel').setDescription('Where to post (defaults to the welcome channel)').setRequired(false))
    .addStringOption((option) => option.setName('title').setDescription('Custom heading').setRequired(false).setMaxLength(200)),
  async run(interaction) {
    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageGuild], { label: 'post the rules' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

    const botCheck = guardBot(guild, [PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot post', botCheck.message)], flags: MessageFlags.Ephemeral });

    const settings = database.settings(guild.id);
    const channelId = interaction.options.getChannel('channel')?.id ?? settings.welcomeChannelId ?? interaction.channelId;
    const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));

    if (!channel?.isTextBased?.()) {
      return interaction.reply({ embeds: [errorEmbed('Wrong channel', 'Pick a normal text channel.')], flags: MessageFlags.Ephemeral });
    }

    const body = interaction.options.getString('body');
    const title = interaction.options.getString('title') ?? BLUEPRINT.messages.rulesTitle;

    const message = await channel
      .send({
        embeds: [
          webEmbed({
            title: truncate(title, 250),
            description: body,
            color: brand.colors.primary,
            footer: `${brand.name} • ${brand.tagline}`,
          }),
        ],
        allowedMentions: { parse: [] },
      })
      .catch((error) => {
        logger.warn(`Could not post rules: ${error.message}`);
        return null;
      });

    if (!message) {
      return interaction.reply({ embeds: [errorEmbed('Could not post', `I failed to post in <#${channel.id}> — check my permissions there.`)], flags: MessageFlags.Ephemeral });
    }

    database.updateGuild(guild.id, { settings: { rulesChannelId: channel.id, rulesMessageId: message.id } });

    await sendLog(guild, {
      type: 'config',
      title: 'Rules posted',
      description: `<#${channel.id}>`,
      fields: [{ name: 'Posted by', value: `<@${interaction.user.id}>`, inline: true }],
    });

    return interaction.reply({
      embeds: [successEmbed('Rules posted', `The rules now live in <#${channel.id}>.`)],
      flags: MessageFlags.Ephemeral,
    });
  },
};

const setverify = {
  data: new SlashCommandBuilder()
    .setName('setverify')
    .setDescription('Post the verification panel (a button that grants a role)')
    .addRoleOption((option) => option.setName('role').setDescription('Role granted on verify (defaults to the entry role)').setRequired(false))
    .addChannelOption((option) => option.setName('channel').setDescription('Where to post (defaults to the verify channel)').setRequired(false))
    .addStringOption((option) => option.setName('body').setDescription('Custom instructions text').setRequired(false).setMaxLength(1500)),
  async run(interaction) {
    const invokerCheck = guardInvoker(interaction, [PermissionFlagsBits.ManageRoles], { label: 'set up verification' });
    if (!invokerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Missing permission', invokerCheck.message)], flags: MessageFlags.Ephemeral });

    const guild = interaction.guild;
    if (!guild) return interaction.reply({ embeds: [errorEmbed('Server only', 'Run this inside a server.')], flags: MessageFlags.Ephemeral });

    const botCheck = guardBot(guild, [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]);
    if (!botCheck.ok) return interaction.reply({ embeds: [errorEmbed('I cannot do that', botCheck.message)], flags: MessageFlags.Ephemeral });

    const settings = database.settings(guild.id);
    const roleId = interaction.options.getRole('role')?.id ?? settings.verifyRoleId ?? settings.autoroleRoleId;
    const role = roleId ? guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId).catch(() => null)) : null;

    const roleCheck = guardRole(guild, role);
    if (!roleCheck.ok) {
      return interaction.reply({
        embeds: [errorEmbed('No usable role', `${roleCheck.message}\n\nRun \`/autorole set\` or pass a \`role\` below my highest role.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    const channelId = interaction.options.getChannel('channel')?.id ?? settings.verifyChannelId ?? interaction.channelId;
    const channel = guild.channels.cache.get(channelId) ?? (await guild.channels.fetch(channelId).catch(() => null));
    if (!channel?.isTextBased?.()) {
      return interaction.reply({ embeds: [errorEmbed('Wrong channel', 'Pick a normal text channel.')], flags: MessageFlags.Ephemeral });
    }

    const body = interaction.options.getString('body') ?? BLUEPRINT.messages.verifyBody;

    const message = await channel
      .send({
        embeds: [
          webEmbed({
            title: BLUEPRINT.messages.verifyTitle,
            description: body,
            color: brand.colors.primary,
            fields: [{ name: 'Unlocks', value: role.toString(), inline: true }],
          }),
        ],
        components: verifyComponents(role.id),
        allowedMentions: { parse: [] },
      })
      .catch((error) => {
        logger.warn(`Could not post the verify panel: ${error.message}`);
        return null;
      });

    if (!message) {
      return interaction.reply({ embeds: [errorEmbed('Could not post', `I failed to post in <#${channel.id}>.`)], flags: MessageFlags.Ephemeral });
    }

    database.updateGuild(guild.id, { settings: { verifyChannelId: channel.id, verifyRoleId: role.id, verifyMessageId: message.id } });

    return interaction.reply({
      embeds: [
        successEmbed('Verification panel posted', `Members can now press the button in <#${channel.id}> to receive ${role.toString()}.`, [
          { name: 'Safety', value: 'Members who already hold the role get a private message instead of a duplicate grant.', inline: false },
        ]),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

export default [setrules, setverify];
