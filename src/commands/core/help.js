import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { errorEmbed, infoEmbed, webEmbed } from '../../utils/embeds.js';
import { chunk, truncate } from '../../utils/format.js';

export const CATEGORY_ORDER = ['core', 'fun', 'economy', 'aura', 'profile', 'ai', 'moderation', 'server', 'owner'];
export const CATEGORY_LABELS = {
  core: '🕸️ Core',
  fun: '🎮 Fun',
  economy: '💰 Economy',
  aura: '🕸️ Aura & XP',
  profile: '🪪 Profile',
  ai: '🤖 AI',
  moderation: '🛡️ Moderation',
  server: '⚙️ Server',
  owner: '👑 Owner',
};

export function sortedCategories(client) {
  const groups = new Map();
  for (const command of client.commands.values()) {
    if (!groups.has(command.category)) groups.set(command.category, []);
    groups.get(command.category).push(command);
  }
  return [...groups.entries()].sort((a, b) => {
    const left = CATEGORY_ORDER.indexOf(a[0]);
    const right = CATEGORY_ORDER.indexOf(b[0]);
    if (left === -1 && right === -1) return a[0].localeCompare(b[0]);
    if (left === -1) return 1;
    if (right === -1) return -1;
    return left - right;
  });
}

export function buildOverview(client) {
  const groups = sortedCategories(client);
  const fields = groups.map(([category, commands]) => ({
    name: CATEGORY_LABELS[category] ?? category,
    value: truncate(
      commands
        .sort((a, b) => a.data.name.localeCompare(b.data.name))
        .map((command) => `\`/${command.data.name}\``)
        .join(' · '),
      1020,
    ),
    inline: false,
  }));

  return infoEmbed(
    `${brand.name} — command menu`,
    `**${client.commands.size}** commands are alive across **${groups.length}** categories.\nUse \`/help <command>\` for the details of one command, or \`/commands\` for every description.`,
    fields,
  );
}

const help = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription(`Open the ${brand.short} menu, or ask about one command`)
    .addStringOption((option) => option.setName('command').setDescription('A command name, for example: ban').setRequired(false)),
  async run(interaction) {
    const requested = interaction.options.getString('command');

    if (requested) {
      const name = requested.toLowerCase().replace(/^\//, '').trim();
      const command = interaction.client.commands.get(name);
      if (!command) {
        return interaction.reply({
          embeds: [errorEmbed('Unknown command', `\`${requested}\` is not one of mine. Run \`/help\` for the full menu.`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      const options = (command.data.options ?? []).map(
        (option) => `• \`${option.name}\` — ${option.description}${option.required ? ' *(required)*' : ''}`,
      );

      return interaction.reply({
        embeds: [
          webEmbed({
            title: `${brand.emoji.web} /${command.data.name}`,
            description: command.data.description,
            fields: [
              { name: 'Category', value: CATEGORY_LABELS[command.category] ?? command.category, inline: true },
              { name: 'Options', value: options.length ? truncate(options.join('\n'), 1020) : 'No options.', inline: false },
            ],
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({ embeds: [buildOverview(interaction.client)], flags: MessageFlags.Ephemeral });
  },
};

const commands = {
  data: new SlashCommandBuilder()
    .setName('commands')
    .setDescription('List every command this bot can run, with descriptions'),
  async run(interaction) {
    const lines = [...interaction.client.commands.values()]
      .sort((a, b) => a.data.name.localeCompare(b.data.name))
      .map((command) => `**/${command.data.name}** — ${truncate(command.data.description, 90)}`);

    const parts = chunk(lines.join('\n'), 3600).slice(0, 10);
    const embeds = parts.map((part, index) =>
      webEmbed({
        title: index === 0 ? `${brand.emoji.web} Every command` : null,
        description: part,
        color: brand.colors.primary,
        footer: `${brand.footer} • page ${index + 1}/${parts.length}`,
      }),
    );

    return interaction.reply({ embeds, flags: MessageFlags.Ephemeral });
  },
};

const menu = {
  data: new SlashCommandBuilder()
    .setName('menu')
    .setDescription(`Post the ${brand.short} menu in this channel`),
  async run(interaction) {
    const groups = sortedCategories(interaction.client);

    const fields = groups.map(([category, list]) => ({
      name: CATEGORY_LABELS[category] ?? category,
      value: truncate(
        list
          .sort((a, b) => a.data.name.localeCompare(b.data.name))
          .map((command) => `\`/${command.data.name}\``)
          .join(' · '),
        1020,
      ),
      inline: false,
    }));

    fields.push({
      name: `${brand.emoji.gear} Where to start`,
      value: [
        '`/setup` — build the whole server in one run (safe to re-run)',
        '`/config view` — see what is configured here',
        '`/setverify` — post the verification panel',
        '`/help <command>` — details for any single command',
      ].join('\n'),
      inline: false,
    });

    return interaction.reply({
      embeds: [
        webEmbed({
          title: `${brand.name}`,
          description: `**${brand.tagline}**\nOwner: **${brand.owner}**\n\nEverything the web can do, live right now:`,
          fields,
          color: brand.colors.primary,
          thumbnail: interaction.client.user.displayAvatarURL({ size: 256 }),
        }),
      ],
      allowedMentions: { parse: [] },
    });
  },
};

export default [help, commands, menu];
