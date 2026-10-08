import { EmbedBuilder } from 'discord.js';

import { brand } from '../config/brand.js';

/**
 * Every embed in the bot is built here so the 🕸️ SPIDER WEB ⸸ X look stays
 * clean, dark and consistent — same footer, same palette, same timestamp.
 */
export function webEmbed({
  title = null,
  description = null,
  fields = null,
  color = brand.colors.primary,
  thumbnail = null,
  image = null,
  author = null,
  footer = brand.footer,
  timestamp = true,
} = {}) {
  const embed = new EmbedBuilder().setColor(color);

  if (title) embed.setTitle(title.slice(0, 250));
  if (description) embed.setDescription(description.slice(0, 4000));
  if (Array.isArray(fields) && fields.length) {
    embed.addFields(
      fields
        .filter((field) => field && field.name && field.value !== undefined && field.value !== null)
        .slice(0, 25)
        .map((field) => ({
          name: String(field.name).slice(0, 250),
          value: String(field.value).slice(0, 1020) || '—',
          inline: Boolean(field.inline),
        })),
    );
  }
  if (author?.name) embed.setAuthor({ name: author.name.slice(0, 250), iconURL: author.iconURL || undefined });
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);
  if (footer) embed.setFooter({ text: footer.slice(0, 2000) });
  if (timestamp) embed.setTimestamp(new Date());

  return embed;
}

export const brandEmbed = webEmbed;

export const successEmbed = (title, description = null, fields = null) =>
  webEmbed({ title: `${brand.emoji.check} ${title}`, description, fields, color: brand.colors.success });

export const errorEmbed = (title, description = null, fields = null) =>
  webEmbed({ title: `${brand.emoji.cross} ${title}`, description, fields, color: brand.colors.error });

export const warningEmbed = (title, description = null, fields = null) =>
  webEmbed({ title: `${brand.emoji.warn} ${title}`, description, fields, color: brand.colors.warning });

export const infoEmbed = (title, description = null, fields = null) =>
  webEmbed({ title: `${brand.emoji.web} ${title}`, description, fields, color: brand.colors.info });

export const modEmbed = (title, description = null, fields = null) =>
  webEmbed({ title: `${brand.emoji.shield} ${title}`, description, fields, color: brand.colors.primary });

export const ownerEmbed = (title, description = null, fields = null) =>
  webEmbed({ title: `${brand.emoji.crown} ${title}`, description, fields, color: brand.colors.fire });

/** Text progress bar, e.g. ▰▰▰▱▱▱▱▱▱▱ */
export function progressBar(current, total, size = 10) {
  const ratio = total > 0 ? Math.min(Math.max(current / total, 0), 1) : 0;
  const filled = Math.round(ratio * size);
  return `${'▰'.repeat(filled)}${'▱'.repeat(Math.max(0, size - filled))}`;
}

export default webEmbed;
