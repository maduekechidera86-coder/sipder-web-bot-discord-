import { PermissionFlagsBits as P } from 'discord.js';

/**
 * The automated /setup blueprint: roles, categories and channels.
 * /setup always looks for an existing item by name first, so re-running it never
 * creates duplicates and never overwrites anything an admin already customised.
 */
export const BLUEPRINT = {
  roles: [
    {
      key: 'bot',
      name: '🤖 Spider Bot',
      color: 0x0b0b10,
      hoist: true,
      level: 100,
      permissions: [],
    },
    {
      key: 'owner',
      name: '👑 Web Owner',
      color: 0xb1121f,
      hoist: true,
      level: 90,
      permissions: [P.Administrator],
    },
    {
      key: 'admin',
      name: '🕷️ Web Admin',
      color: 0xe02a3c,
      hoist: true,
      level: 80,
      permissions: [
        P.ManageGuild,
        P.ManageRoles,
        P.ManageChannels,
        P.KickMembers,
        P.BanMembers,
        P.ModerateMembers,
        P.ManageMessages,
        P.ManageNicknames,
        P.ViewAuditLog,
        P.ManageWebhooks,
        P.MentionEveryone,
      ],
    },
    {
      key: 'moderator',
      name: '🛡️ Web Moderator',
      color: 0x8e96ad,
      hoist: true,
      level: 70,
      permissions: [
        P.KickMembers,
        P.ModerateMembers,
        P.ManageMessages,
        P.ManageNicknames,
        P.ViewAuditLog,
        P.MoveMembers,
      ],
    },
    {
      key: 'member',
      name: '⚡ Web Member',
      color: 0x27ae60,
      hoist: false,
      level: 10,
      permissions: [],
    },
  ],

  categories: [
    { key: 'hq', name: '🕸️ WEB HQ' },
    { key: 'community', name: '💬 COMMUNITY' },
    { key: 'fun', name: '🎮 FUN' },
    { key: 'ai', name: '🤖 AI' },
    { key: 'logs', name: '📋 LOGS' },
  ],

  channels: [
    { key: 'welcome', name: '👋・welcome', category: 'hq', topic: 'New souls entering the web.', readOnly: true },
    { key: 'announcements', name: '📢・announcements', category: 'community', topic: '🕸️ SPIDER WEB ⸸ X announcements.', readOnly: true },
    { key: 'chat', name: '💬・chat', category: 'community', topic: 'THE WEB IS AWAKE — talk here.' },
    { key: 'games', name: '🎮・games', category: 'fun', topic: 'Games, giveaways and chaos.' },
    { key: 'ai', name: '🤖・ai', category: 'ai', topic: 'Ask the web anything.' },
    { key: 'modLogs', name: '📋・mod-logs', category: 'logs', topic: 'Moderation and server logs.', staffOnly: true },
  ],

  settings: {
    welcomeChannel: 'welcome',
    goodbyeChannel: 'welcome',
    announcementChannel: 'announcements',
    logChannel: 'modLogs',
    autorole: 'member',
    verifyRole: 'member',
  },

  messages: {
    welcome:
      '🕸️ {user} has entered the web — welcome to **{server}**!\nYou are member **#{membercount}**. Read the rules and enjoy the dark.',
    goodbye: '🌑 {user} slipped out of the web. **{server}** now holds **{membercount}** souls.',
    verifyTitle: '🕷️ Verification',
    verifyBody: 'Press the button below to prove you are not part of the swarm and unlock the server.',
    verifyButton: 'Verify',
    rulesTitle: '🕸️ Server Rules',
  },
};

export const BLUEPRINT_ROLE_KEYS = BLUEPRINT.roles.map((role) => role.key);
export const BLUEPRINT_CHANNEL_KEYS = BLUEPRINT.channels.map((channel) => channel.key);
