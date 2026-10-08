import { Events } from 'discord.js';

import { handleComponent } from '../utils/components.js';
import { logger } from '../utils/logger.js';

/**
 * Extra interaction listener, loaded automatically like every other event.
 *
 * The verification button and all slash commands stay with the original router —
 * this one only answers component ids registered through utils/components.js.
 */
export default {
  name: Events.InteractionCreate,

  async run(interaction) {
    if (!interaction.isButton() && !interaction.isAnySelectMenu()) return undefined;
    if (interaction.customId.startsWith('web:verify')) return undefined; // owned by the main router

    try {
      return await handleComponent(interaction);
    } catch (error) {
      logger.error(`Component "${interaction.customId}" failed: ${error?.stack ?? error?.message ?? error}`);
      const payload = { content: 'That button broke — try the slash command instead.', flags: 64 };
      if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => null);
      return interaction.reply(payload).catch(() => null);
    }
  },
};
