import { MessageFlags, SlashCommandBuilder } from 'discord.js';

import { brand } from '../../config/brand.js';
import { database } from '../../database/index.js';
import { errorEmbed, infoEmbed, webEmbed } from '../../utils/embeds.js';
import { formatNumber, timeAgo, truncate } from '../../utils/format.js';

function resolveUser(interaction) {
  return interaction.options.getUser('user') ?? interaction.user;
}

const userinfo = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Everything about a member: roles, dates, warnings')
    .addUserOption((option) => option.setName('user').setDescription('Who to inspect (defaults to you)').setRequired(false)),
  async run(interaction) {
    const user = resolveUser(interaction);
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    const profile = database.user(user.id, { username: user.username });
    const warnings = interaction.guild ? database.warnings(interaction.guild.id, user.id) : [];

    const fields = [
      { name: 'Account created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'Joined server', value: member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'not in this server', inline: true },
      { name: 'Nickname', value: member?.nickname ? truncate(member.nickname, 60) : '—', inline: true },
      { name: 'Profile seen here', value: `first seen ${timeAgo(profile.firstSeen)} · last seen ${timeAgo(profile.lastSeen)}`, inline: false },
      { name: 'Commands used', value: formatNumber(profile.commandsUsed ?? 0), inline: true },
      { name: 'Warnings', value: `${warnings.length}`, inline: true },
    ];

    if (member) {
      const roles = member.roles.cache
        .filter((role) => role.id !== interaction.guild.roles.everyone.id)
        .sort((a, b) => b.position - a.position)
        .map((role) => role.toString());
      fields.push({ name: `Roles (${roles.length})`, value: truncate(roles.join(' ') || 'none', 1020), inline: false });
    }

    return interaction.reply({
      embeds: [
        webEmbed({
          title: `${brand.emoji.spider} ${user.tag}`,
          description: `<@${user.id}> · \`${user.id}\``,
          thumbnail: user.displayAvatarURL({ size: 256 }),
          fields,
        }),
      ],
      flags: MessageFlags.Ephemeral,
    });
  },
};

const avatar = {
  data: new SlashCommandBuilder()
    .setName('avatar')
    .setDescription('Full-size avatar of you or another member')
    .addUserOption((option) => option.setName('user').setDescription('Whose avatar (defaults to you)').setRequired(false)),
  async run(interaction) {
    const user = resolveUser(interaction);
    const member = interaction.guild?.members.cache.get(user.id) ?? null;

    const fields = [
      {
        name: 'Server avatar',
        value: member?.avatar ? `[png 1024](${member.displayAvatarURL({ size: 1024, extension: 'png' })}) · [webp 512](${member.displayAvatarURL({ size: 512, extension: 'webp' })})` : 'none set — using the global avatar',
        inline: true,
      },
      {
        name: 'Global avatar',
        value: `[png 1024](${user.displayAvatarURL({ size: 1024, extension: 'png' })}) · [webp 512](${user.displayAvatarURL({ size: 512, extension: 'webp' })})`,
        inline: true,
      },
    ];

    return interaction.reply({
      embeds: [
        webEmbed({
          title: `${brand.emoji.web} ${user.tag}`,
          image: member?.displayAvatarURL({ size: 1024 }) ?? user.displayAvatarURL({ size: 1024 }),
          fields,
        }),
      ],
    });
  },
};

const banner = {
  data: new SlashCommandBuilder()
    .setName('banner')
    .setDescription('Profile banner of you or another member')
    .addUserOption((option) => option.setName('user').setDescription('Whose banner (defaults to you)').setRequired(false)),
  async run(interaction) {
    const user = resolveUser(interaction);
    const fetched = await user.fetch(true).catch(() => user);
    const url = fetched.bannerURL?.({ size: 1024 });

    if (!url) {
      return interaction.reply({
        embeds: [errorEmbed('No banner', `**${user.tag}** has no profile banner set.`)],
        flags: MessageFlags.Ephemeral,
      });
    }

    return interaction.reply({
      embeds: [
        infoEmbed(`${user.tag} — banner`, null, [
          { name: 'Download', value: `[png 1024](${fetched.bannerURL({ size: 1024, extension: 'png' })}) · [webp 512](${fetched.bannerURL({ size: 512, extension: 'webp' })})`, inline: false },
        ]).setImage(url),
      ],
    });
  },
};

export default [userinfo, avatar, banner];
