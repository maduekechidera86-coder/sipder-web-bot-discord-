# 🕸️ SPIDER WEB ⸸ X

> **THE WEB IS AWAKE.**

A modular Discord bot built on **Node.js** and **discord.js v14**.
**Owner / Brand:** NIGHTMARE

---

## 1. Requirements

- **Node.js 18.17 or newer** (`node -v`)
- A Discord application → **Bot** (Developer portal)
- The bot invited with the scopes `bot` + `applications.commands`

**Recommended bot permissions:** `Administrator` (simplest for `/setup`), or at minimum:
`Manage Roles`, `Manage Channels`, `Kick Members`, `Ban Members`, `Moderate Members`,
`Manage Messages`, `Manage Nicknames`, `View Audit Log`, `Send Messages`, `Embed Links`, `Attach Files`.

> ⚠️ Role hierarchy: the bot's **highest role must sit above** the roles it moderates.
> In *Server Settings → Roles*, drag `🤖 Spider Bot` near the top.

---

## 2. Install

```bash
npm install
```

## 3. Configure

```bash
cp .env.example .env
```

Open `.env` in your own editor and fill in `DISCORD_TOKEN`, `CLIENT_ID` and `OWNER_ID`.

**Never paste your token into a chat, a website or a commit.** `.env` is git-ignored.
No secret is ever hard-coded — everything sensitive is read from the environment.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DISCORD_TOKEN` | ✅ | Bot token (Developer portal → Bot) |
| `CLIENT_ID` | ✅ | Application ID |
| `GUILD_ID` | – | Test server ID → instant command deploy |
| `OWNER_ID` | recommended | Unlocks `/broadcast`, `/stats`, `/maintenance`, … |
| `MEDIA_API_ENDPOINT` | ✅ | Base URL of the media/AI API (default `https://prexzyapis.com`) |
| `LOG_LEVEL` | – | `error` \| `warn` \| `info` \| `debug` |
| `DATABASE_PATH` | – | JSON database file (default `./data/database.json`) |
| `API_TIMEOUT_MS` | – | API request timeout (default `15000`) |
| `GLOBAL_COMMANDS` | – | `true` forces global slash-command registration |

## 4. Deploy the slash commands

```bash
npm run deploy          # to GUILD_ID (instant)
npm run deploy:global   # everywhere (up to 1 hour to propagate)
npm run clear           # remove all registered commands
```

## 5. Start the bot

```bash
npm start
```

Then run **`/setup`** in your server. It creates or reuses every role, category and
channel from the blueprint, wires up welcome/goodbye, autorole and moderation logs,
saves every ID in the database, and reports anything Discord blocked. It is
**idempotent** — run it as often as you like, it never duplicates anything.

---

## Project structure

```
src/
├── commands/
│   ├── core/          /help /ping /botinfo /serverinfo /userinfo /avatar …
│   ├── moderation/    /ban /kick /timeout /warn /clear /lock /role …
│   ├── server/        /setup /config /setwelcome /announce /channel …
│   └── owner/         /broadcast /stats /logs /maintenance /reload …
├── events/            ready · interactionCreate · guildMemberAdd · guildMemberRemove
├── services/
│   ├── prexzy.js      the single API service layer (GET/POST, timeout, errors)
│   └── logs.js        branded moderation / server logging
├── database/
│   ├── index.js       storage abstraction used by every command
│   └── jsonStore.js   restart-safe JSON storage (atomic writes)
├── config/            config.js · brand.js · serverBlueprint.js
├── utils/             embeds · permissions · errors · logger · format · loaders · lifecycle
├── index.js           client bootstrap
└── deploy-commands.js slash-command deployment
```

## Storage

`database/jsonStore.js` keeps the whole state in memory and writes it to disk
atomically (`write temp file → rename`), debounced, plus on every shutdown signal.
It is **restart-safe**: data survives restarts, `/restart` flushes before exiting, and a
corrupted file is backed up instead of wiping state.

Everything goes through `database/index.js` — swap the JSON store for SQLite, Postgres
or Redis by implementing the same handful of methods; no command touches the storage layer directly.

## Keeping it alive

`/restart` and `/shutdown` save data, destroy the Discord client and exit the process.
Run the bot under a supervisor that restarts it, for example:

```bash
pm2 start src/index.js --name spider-web-x
# or
npx systemd-unit  # or your own service unit
```

## Adding your own commands

Drop a file anywhere under `src/commands/<category>/`:

```js
import { SlashCommandBuilder } from 'discord.js';
import { webEmbed } from '../../utils/embeds.js';

export default {
  data: new SlashCommandBuilder().setName('hello').setDescription('Say hi'),
  async run(interaction) {
    await interaction.reply({ embeds: [webEmbed({ title: 'Hello', description: 'The web is awake.' })] });
  },
};
```

A file may export **one** command object or **an array** of them. Nothing else to register —
the loader picks it up, and `npm run deploy` publishes it.

## Security

- Secrets come only from `.env`; the logger redacts anything that looks like a token.
- Owner commands verify `OWNER_ID` (plus a database owner list that only the primary owner can edit).
- No `eval` / remote-code command exists, by design.
- Every moderation command checks the user's permission, the bot's permission, role
  hierarchy, and refuses to touch the server owner or the bot itself.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Missing required environment values` | Fill in `.env` |
| `An invalid token was provided` | Reset the token in the portal and update `.env` |
| Commands don't show up | Run `npm run deploy`, restart Discord (⌘/Ctrl + R) |
| `I am missing a permission` | Give the bot the permission named in the reply |
| Role actions silently fail | Drag the bot's role above the target role |
| `/setup` reports blocked items | Grant the bot `Manage Roles` and `Manage Channels`, then re-run `/setup` |

---

🕸️ **SPIDER WEB ⸸ X • NIGHTMARE • THE WEB IS AWAKE**
