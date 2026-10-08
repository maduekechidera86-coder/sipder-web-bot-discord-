import { Events, MessageFlags } from 'discord.js';

import { brand } from '../config/brand.js';
import { database } from '../database/index.js';
import { webEmbed } from '../utils/embeds.js';
import { handleCommandError, replyError } from '../utils/errors.js';
import { isShuttingDown } from '../utils/lifecycle.js';
import { logger } from '../utils/logger.js';
import { handleVerifyButton } from '../commands/server/rules.js';

/** Single entry point for every interaction: buttons, autocomplete and slash commands. */
export default {
  name: Events.InteractionCreate,

  async run(interaction) {
    try {
      if (interaction.isButton()) {
        if (interaction.customId.startsWith('web:verify')) return await handleVerifyButton(interaction);
        return undefined;
      }

      if (interaction.isAutocomplete()) {
        return undefined;
      }

      if (!interaction.isChatInputCommand()) return undefined;

      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        return await replyError(interaction, 'That command is not loaded any more — run `npm run deploy` and restart the bot.');
      }

      if (isShuttingDown()) {
        return await replyError(interaction, 'The bot is shutting down — try again in a moment.');
      }

      const state = database.state();
      if (state.maintenance && !database.isOwner(interaction.user.id)) {
        return await interaction.reply({
          embeds: [
            webEmbed({
              title: `${brand.emoji.moon} Maintenance`,
              description: `The web is being rewoven${state.maintenanceBy ? ` by <@${state.maintenanceBy}>` : ''}. Please try again shortly.`,
              color: brand.colors.warning,
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!interaction.guildId && !command.allowDirectMessages) {
        return await replyError(interaction, 'This command only works inside a server.');
      }

      database.bump('commandsRun');
      database.touchUser(interaction.user.id, { username: interaction.user.username });
      if (interaction.guildId) {
        const guildRecord = database.guild(interaction.guildId);
        database.updateGuild(interaction.guildId, {
          counters: { commandsRun: (guildRecord.counters?.commandsRun ?? 0) + 1 },
        });
      }

      logger.debug(`/${interaction.commandName} used by ${interaction.user.tag}${interaction.guild ? ` in ${interaction.guild.name}` : ''}`);
      return await command.run(interaction);
    } catch (error) {
      const name = interaction.isChatInputCommand?.() ? interaction.commandName : interaction.customId ?? 'component';
      return handleCommandError(interaction, error, { command: name });
    }
  },
};
