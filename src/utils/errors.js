import { DiscordAPIError, HTTPError, MessageFlags } from 'discord.js';

import { database } from '../database/index.js';
import { errorEmbed } from './embeds.js';
import { logger } from './logger.js';

/** Central error handling: one place decides what the user sees and what we log. */

const FRIENDLY_CODES = {
  50013: 'I am missing a permission Discord requires for that action.',
  50001: 'I do not have access to that channel or resource.',
  10003: 'That channel no longer exists.',
  10004: 'I am no longer in that server.',
  10007: 'That member is no longer in this server.',
  10008: 'That message no longer exists.',
  10011: 'That role no longer exists.',
  10013: 'That user cannot be found on Discord.',
  10026: 'Discord had a temporary problem reaching that user.',
  10062: 'That interaction expired before I could answer it.',
  40060: 'That interaction was already answered.',
  50007: 'I cannot send a direct message to that user (their DMs are closed).',
  50035: 'Discord rejected those values as invalid.',
};

export function explainError(error) {
  if (!error) return 'Something went wrong, but Discord did not say what.';
  if (error.type === 'timeout' || error.name === 'AbortError' || error.name === 'TimeoutError') return 'The request timed out.';
  if (error.type === 'network_error') return 'I could not reach the external API.';
  if (error.type === 'invalid_payload') return 'The external API returned an unreadable response.';
  if (error.type === 'http_error') return `The external API refused the request (HTTP ${error.status}).`;
  if (error.type === 'too_large') return error.message;
  if (error instanceof DiscordAPIError) return FRIENDLY_CODES[error.code] ?? `Discord refused the request (error ${error.code}).`;
  if (error instanceof HTTPError) return `Discord returned HTTP ${error.status}.`;
  return error.message || 'Something went wrong.';
}

/** Replies with a branded error, whether or not the interaction was already answered. */
export async function replyError(interaction, message, { ephemeral = true } = {}) {
  const embed = errorEmbed('Something went wrong', message);
  try {
    if (interaction.deferred && !interaction.replied) return await interaction.editReply({ embeds: [embed] });
    if (interaction.replied) return await interaction.followUp({ embeds: [embed], flags: ephemeral ? MessageFlags.Ephemeral : undefined });
    return await interaction.reply({ embeds: [embed], flags: ephemeral ? MessageFlags.Ephemeral : undefined });
  } catch (error) {
    logger.warn(`Could not deliver an error message: ${error.message}`);
    return null;
  }
}

/** Used by the interaction router: log the real error, show a safe one. */
export async function handleCommandError(interaction, error, { command = 'unknown' } = {}) {
  const friendly = explainError(error);
  logger.error(`Command "${command}" failed for ${interaction.user?.tag ?? 'unknown'} (${interaction.guild?.name ?? 'DM'}): ${error?.stack ?? error?.message ?? error}`);

  try {
    database.audit({
      guildId: interaction.guildId ?? null,
      type: 'error',
      title: `/${command} failed`,
      description: friendly,
    });
  } catch {
    /* audit is best-effort */
  }

  return replyError(interaction, friendly);
}

/**
 * Nothing should ever take the bot down silently: unhandled rejections are logged,
 * and a crash flushes the database before exiting.
 */
export function registerGlobalErrorHandlers() {
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled promise rejection: ${reason?.stack ?? reason ?? 'unknown'}`);
  });

  process.on('uncaughtException', async (error) => {
    logger.error(`Uncaught exception: ${error?.stack ?? error?.message ?? error}`);
    try {
      await database.close();
    } catch (closeError) {
      logger.error(`Could not save data after the crash: ${closeError.message}`);
    }
    process.exit(1);
  });
}

export default explainError;
