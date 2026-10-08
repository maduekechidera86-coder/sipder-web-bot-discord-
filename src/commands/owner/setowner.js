import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { config, isPrimaryOwner } from '../../config/config.js';
import { database } from '../../database/index.js';
import { errorEmbed, ownerEmbed, successEmbed, warningEmbed } from '../../utils/embeds.js';
import { truncate } from '../../utils/format.js';
import { guardOwner } from '../../utils/permissions.js';

const setowner = {
  data: new SlashCommandBuilder()
    .setName('setowner')
    .setDescription('Owner: manage the extra owners list')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('What to do')
        .setRequired(true)
        .addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }, { name: 'list', value: 'list' }),
    )
    .addUserOption((option) => option.setName('user').setDescription('Who (not needed for list)').setRequired(false)),
  async run(interaction) {
    // Only the OWNER_ID from .env can hand out owner powers.
    if (!isPrimaryOwner(interaction.user.id)) {
      return interaction.reply({
        embeds: [errorEmbed('Primary owner only', 'Only the owner defined by `OWNER_ID` in the environment can change the owner list.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    const action = interaction.options.getString('action');
    const user = interaction.options.getUser('user');

    if (action === 'list') {
      const owners = database.owners();
      return interaction.reply({
        embeds: [
          ownerEmbed('Owners', null, [
            { name: 'Primary (from .env)', value: config.ownerId ? `<@${config.ownerId}>` : 'not configured', inline: false },
            { name: 'Additional', value: truncate(owners.map((id) => `<@${id}>`).join('\n') || 'none', 1020), inline: false },
          ]),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!user) {
      return interaction.reply({ embeds: [errorEmbed('Missing user', 'Pass a `user` for add or remove.')], flags: MessageFlags.Ephemeral });
    }

    if (action === 'add') {
      if (database.isOwner(user.id)) {
        return interaction.reply({ embeds: [warningEmbed('Already an owner', `<@${user.id}> is already in the list.`)], flags: MessageFlags.Ephemeral });
      }
      database.addOwner(user.id);
      return interaction.reply({ embeds: [successEmbed('Owner added', `<@${user.id}> can now use owner commands.`)], flags: MessageFlags.Ephemeral });
    }

    if (isPrimaryOwner(user.id)) {
      return interaction.reply({
        embeds: [errorEmbed('Cannot remove', 'That is the primary owner from `OWNER_ID` — change it in `.env` instead.')],
        flags: MessageFlags.Ephemeral,
      });
    }

    const removed = database.removeOwner(user.id);
    return interaction.reply({
      embeds: [
        removed.includes(user.id)
          ? successEmbed('Owner removed', `<@${user.id}> lost owner access.`)
          : warningEmbed('Not found', `<@${user.id}> was not in the owner list.`),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

const premium = {
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Owner: manage premium flags for a guild or a user')
    .addStringOption((option) =>
      option
        .setName('action')
        .setDescription('What to do')
        .setRequired(true)
        .addChoices({ name: 'grant', value: 'grant' }, { name: 'revoke', value: 'revoke' }, { name: 'list', value: 'list' }),
    )
    .addStringOption((option) =>
      option.setName('scope').setDescription('Apply to a guild or a user').setRequired(false).addChoices({ name: 'guild', value: 'guild' }, { name: 'user', value: 'user' }),
    )
    .addStringOption((option) => option.setName('id').setDescription('Guild or user ID').setRequired(false).setMaxLength(25))
    .addStringOption((option) => option.setName('tier').setDescription('Tier label, e.g. web').setRequired(false).setMaxLength(40))
    .addStringOption((option) => option.setName('note').setDescription('Note stored with the flag').setRequired(false).setMaxLength(200)),
  async run(interaction) {
    const ownerCheck = guardOwner(interaction.user.id, database.isOwner(interaction.user.id), { action: 'manage premium flags' });
    if (!ownerCheck.ok) return interaction.reply({ embeds: [errorEmbed('Owner only', ownerCheck.message)], flags: MessageFlags.Ephemeral });

    const action = interaction.options.getString('action');

    if (action === 'list') {
      const list = database.premiumList();
      return interaction.reply({
        embeds: [
          ownerEmbed(`Premium — ${list.length} active`, null, [
            {
              name: 'Active flags',
              value: truncate(list.map((entry) => `\`${entry.key}\` · tier ${entry.tier ?? '—'} · ${entry.note ?? 'no note'}`).join('\n') || 'none', 3000),
              inline: false,
            },
          ]),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    const scope = interaction.options.getString('scope');
    const id = interaction.options.getString('id')?.replace(/\D/g, '');
    if (!scope || !id) {
      return interaction.reply({ embeds: [errorEmbed('Missing target', 'Pass both `scope` and `id` for grant or revoke.')], flags: MessageFlags.Ephemeral });
    }

    const key = `${scope}:${id}`;

    if (action === 'grant') {
      database.setPremium(key, {
        active: true,
        tier: interaction.options.getString('tier') ?? 'web',
        since: Date.now(),
        note: interaction.options.getString('note') ?? null,
        grantedBy: interaction.user.id,
      });
      return interaction.reply({ embeds: [successEmbed('Premium granted', `\`${key}\` is now premium.`)], flags: MessageFlags.Ephemeral });
    }

    database.setPremium(key, { active: false, revokedAt: Date.now(), grantedBy: interaction.user.id });
    return interaction.reply({ embeds: [successEmbed('Premium revoked', `\`${key}\` lost premium.`)], flags: MessageFlags.Ephemeral });
  },
};

export default [setowner, premium];
