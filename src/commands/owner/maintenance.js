import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { database } from '../../database/index.js';
import { loadCommands } from '../../utils/loaders.js';
import { softShutdown } from '../../utils/lifecycle.js';
import { errorEmbed, ownerEmbed, warningEmbed } from '../../utils/embeds.js';
import { logger } from '../../utils/logger.js';
import { guardOwner } from '../../utils/permissions.js';

const maintenance = {
  data: new SlashCommandBuilder()
    .setName('maintenance')
    .setDescription('Owner: switch the bot into maintenance mode')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('What to do')
        .setRequired(true)
        .addChoices({ name: 'enable', value: 'enable' }, { name: 'disable', value: 'disable' }, { name: 'status', value: 'status' }),
    )
    .addStringOption((option) => option.setName('message').setDescription('What users see while it is on').setRequired(false).setMaxLength(500)),
  async run(interaction) {
    const ownerCheck = guardOwner(interaction.user.id, database.isOwner(interaction.user.id), { action: 'control maintenance mode' });
    if (!ownerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Owner only', ownerCheck.message)], flags: MessageFlags.Ephemeral });

    const action = interaction.options.getString('action');
    const state = database.state();

    if (action === 'status') {
      return interaction.reply({
        embeds: [
          ownerEmbed('Maintenance status', state.maintenance ? '**ON** — normal commands are blocked for everyone but you.' : '**OFF** — the bot is serving everyone.', [
            { name: 'Since', value: state.maintenanceSince ? `<t:${Math.floor(state.maintenanceSince / 1000)}:R>` : '—', inline: true },
            { name: 'Enabled by', value: state.maintenanceBy ? `<@${state.maintenanceBy}>` : '—', inline: true },
          ]),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (action === 'enable') {
      const message = interaction.options.getString('message') ?? null;
      database.setState({ maintenance: true, maintenanceSince: Date.now(), maintenanceBy: interaction.user.id, maintenanceMessage: message });
      logger.warn(`Maintenance mode enabled by ${interaction.user.tag}.`);
      return interaction.reply({
        embeds: [warningEmbed('Maintenance mode ON', 'Normal users can no longer run commands. You can still use owner commands.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    database.setState({ maintenance: false, maintenanceSince: null, maintenanceBy: null, maintenanceMessage: null });
    logger.info(`Maintenance mode disabled by ${interaction.user.tag}.`);
    return interaction.reply({ embeds: [ownerEmbed('Maintenance mode OFF', 'The web is open again.')], flags: MessageFlags.Ephemeral });
  },
};

const reload = {
  data: new SlashCommandBuilder()
    .setName('reload')
    .setDescription('Owner: reload command files from disk without restarting'),
  async run(interaction) {
    const ownerCheck = guardOwner(interaction.user.id, database.isOwner(interaction.user.id), { action: 'reload commands' });
    if (!ownerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Owner only', ownerCheck.message)], flags: MessageFlags.Ephemeral });

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const before = interaction.client.commands.size;
    const commands = await loadCommands({ fresh: true });

    interaction.client.commands.clear();
    for (const command of commands) {
      if (!interaction.client.commands.has(command.data.name)) interaction.client.commands.set(command.data.name, command);
    }
    const after = interaction.client.commands.size;

    logger.info(`Command reload by ${interaction.user.tag}: ${before} → ${after}.`);

    return interaction.editReply({
      embeds: [
        ownerEmbed('Commands reloaded', null, [
          { name: 'Before', value: String(before), inline: true },
          { name: 'After', value: String(after), inline: true },
          { name: 'Note', value: 'New or renamed slash commands still need `npm run deploy` before Discord shows them.', inline: false },
        ]),
      ],
    });
  },
};

async function stopProcess(interaction, { reason, label, description }) {
  await interaction.reply({
    embeds: [
      ownerEmbed(label, description, [
        { name: 'Requested by', value: `<@${interaction.user.id}>`, inline: true },
        { name: 'Saved', value: 'database flushed before exiting', inline: true },
      ]),
    ],
    flags: MessageFlags.Ephemeral,
  });

  logger.warn(`${label} requested by ${interaction.user.tag} (${reason}).`);
  await database.flush();
  await softShutdown({ reason, code: 0, client: interaction.client });
  return true;
}

const restart = {
  data: new SlashCommandBuilder()
    .setName('restart')
    .setDescription('Owner: save everything and exit so your host can restart the bot'),
  async run(interaction) {
    const ownerCheck = guardOwner(interaction.user.id, database.isOwner(interaction.user.id), { action: 'restart the bot' });
    if (!ownerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Owner only', ownerCheck.message)], flags: MessageFlags.Ephemeral });

    return stopProcess(interaction, {
      reason: `restart by ${interaction.user.tag}`,
      label: 'Restarting',
      description: 'Data was saved and the process is exiting now. It comes back on its own if you run the bot under pm2, Docker, systemd or any supervisor — otherwise start it again with `npm start`.',
    });
  },
};

const shutdown = {
  data: new SlashCommandBuilder()
    .setName('shutdown')
    .setDescription('Owner: save everything and stop the bot (requires confirm:true)')
    .addBooleanOption((option) => option.setName('confirm').setDescription('Set true to really stop the bot').setRequired(true)),
  async run(interaction) {
    const ownerCheck = guardOwner(interaction.user.id, database.isOwner(interaction.user.id), { action: 'shut the bot down' });
    if (!ownerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Owner only', ownerCheck.message)], flags: MessageFlags.Ephemeral });

    if (!interaction.options.getBoolean('confirm')) {
      return interaction.reply({
        embeds: [warningEmbed('Not confirmed', 'Run the command again with `confirm:true` to stop the bot.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    return stopProcess(interaction, {
      reason: `shutdown by ${interaction.user.tag}`,
      label: 'Shutting down',
      description: `**${brand.name}** is saving its data and going dark. Start it again with \`npm start\` (or let your supervisor do it).`,
    });
  },
};

export default [maintenance, reload, restart, shutdown];
