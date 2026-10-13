# Community Utilities — Discord Bot

A lightweight, **English-only** Discord bot for a game community. It provides:

1. **Discord invitation protection** — removes invites outside approved channels (for example `#clan-ads`), while optionally allowing links in text chats attached to voice channels.
2. **Temporary voice rooms** — players join a creator lobby, get their own voice room, and use a polished button panel to control privacy, membership, and room limits. Empty rooms are deleted automatically.

No PostgreSQL, database server, or other bots are required. Each server has its own saved configuration.

> This is **not** a server migration or administration bot. It does not delete your normal channels, change unrelated roles, or copy content from any other server.

## Requirements

- Node.js 20.11 or newer (Node.js 22 LTS is recommended).
- Discord bot/application token created in your own Discord Developer Portal.
- Discord bot permissions in your server:
  - View Channels, Send Messages, Embed Links, Read Message History
  - Manage Messages (for removing illegal invites)
  - Manage Channels (to create, update, and remove temporary rooms)
  - Move Members (to transfer users into rooms / kick from voice)
  - Use Application Commands
- **Message Content Intent** enabled at **Discord Developer Portal → Bot → Privileged Gateway Intents** (necessary for detecting links). The bot does **not** need Server Members Intent.

Make sure role/channel-specific overwrites also allow the bot to perform these actions.

## Install (local PC or VPS)

1. Create a new Discord application and bot at <https://discord.com/developers/applications>.
2. Enable **Message Content Intent**.
3. Invite the bot using the **bot** and **applications.commands** OAuth2 scopes with the permissions above.
4. Copy `.env.example` to `.env`, then add your own `DISCORD_TOKEN`.
5. Optionally add `GUILD_ID` to restrict the bot to your main server.
6. Run:

```bash
npm install
npm start
```

The bot registers its slash commands automatically when it comes online. Allow a few seconds for commands to appear.

**Security:** Never send your bot token to someone else or commit `.env` to a repository. Tokens from other servers/projects are not included. Rotate any token that was accidentally shared.

## First-time setup (inside Discord)

### Invitation protection

This feature is **disabled by default**, so it cannot unexpectedly remove messages before you choose your channel exemptions.

```text
/invites allow channel:#clan-ads
/invites voice-text enabled:true
/invites logs channel:#mod-logs      (optional)
/invites enable enabled:true
/invites status
```

Any normal member posting `discord.gg/...`, `discord.com/invite/...`, or `discordapp.com/invite/...` outside allowed places will have the message automatically removed. This works for both new and edited messages. The bot ignores bots and webhooks.

A channel added to the allowed list also permits invitations in its threads. With `voice-text enabled:true`, the text chat attached to a voice channel is also exempt. By default, **moderators are NOT exempt**; you can enable a bypass if desired.

More commands:

```text
/invites disallow channel:#old-channel
/invites role-add role:@Community Staff
/invites role-remove role:@Community Staff
/invites staff-bypass enabled:true
/invites voice-text enabled:false
/invites logs-off
/invites enable enabled:false
```

Only users with **Manage Server** permission can change settings.

### Temporary voice system

Run:

```text
/setup-voice
```

The bot creates (if needed):

- `🔊 VOICE ROOMS` — a category
- `➕ Create Voice` — the lobby that creates rooms
- `🎛️-voice-controls` — a read-only text channel holding the interactive control panel

It enables the system immediately. Repeating `/setup-voice` reuses its previously saved channels rather than duplicating them.

Alternatively, you can give `/setup-voice` existing `category`, `creator`, and/or `panel` channels. You can change them afterward:

```text
/voice category channel:YOUR_CATEGORY
/voice creator channel:YOUR_CREATE_VOICE_CHANNEL
/voice panel channel:#your-panel-channel
/voice name template:🔊・{user}'s Room {number}
/voice limit number:5
/voice staff-add role:@Moderators
/voice panel-refresh
/voice status
```

Players do **not** need any commands. They just enter the creator lobby, get automatically moved to their new room, and use the buttons in the control panel.

#### Voice panel controls

| Button | What it does |
|---|---|
| Limit | Set room user limit (0–99) |
| Privacy | Toggle public/private; private rooms block new connections except trusted users, the owner, and authorized staff |
| Delete | Remove the room, with a confirmation step |
| Unblock | Allow a previously blocked member to enter again |
| Block | Deny a member access, and disconnect them if present |
| Trust | Permit a member to enter even when the room is private |
| Kick | Disconnect a member from your room |
| Untrust | Remove a previously trusted member's special access |
| Transfer | Give ownership to another server member |

**Permissions:** A member controls only the room they own. Users with **Manage Channels** or a role added via `/voice staff-add` can manage a temporary room after joining it. Rooms are created with matching permission overwrites for the configured staff roles. Admins can grant staff roles before inviting everyone to use the feature.

**Room lifecycle:**

- Each user owns at most one tracked room at a time.
- When all members leave, the empty temporary channel is deleted.
- Room ownership and settings are saved to disk to survive normal process restarts.
- The bot reconciles empty/missing rooms after it reconnects; admins can also run `/voice cleanup`.

Other voice commands:

```text
/voice enable enabled:false
/voice enable enabled:true
/voice staff-remove role:@Moderators
/voice panel-refresh
/voice cleanup
```

## Emoji customization

Unicode emojis are used by default, so the bot works even if your server has no custom emojis. To use custom server emojis in the buttons and embed, set any of these optional environment variables:

```env
VOICE_EMOJI_LIMIT=<:voice_limit:123456789012345678>
VOICE_EMOJI_PRIVACY=<:voice_privacy:123456789012345678>
VOICE_EMOJI_DELETE=<:voice_delete:123456789012345678>
VOICE_EMOJI_UNLOCK=<:voice_unlock:123456789012345678>
VOICE_EMOJI_BLOCK=<:voice_block:123456789012345678>
VOICE_EMOJI_TRUST=<:voice_trust:123456789012345678>
VOICE_EMOJI_KICK=<:voice_kick:123456789012345678>
VOICE_EMOJI_UNTRUST=<:voice_untrust:123456789012345678>
VOICE_EMOJI_TRANSFER=<:voice_transfer:123456789012345678>
```

Custom emoji IDs must refer to emojis the bot is allowed to use. Restart the bot, then run `/voice panel-refresh`. Invalid or inaccessible custom emojis may cause the panel to fail; remove that setting to return to the Unicode fallback.

## Data and backups

Per-server settings and temporary room ownership are stored as JSON files under `data/<GUILD_ID>.json`, or under `DATA_DIR` if configured. Changes are saved with an atomic file replace to minimize corruption.

**Important for hosts:** use a **persistent directory/volume** and back up this folder. Some hosts reset local files during app deployment or reinstall; if that happens, the saved configuration and tracked room ownership will be lost. Set `DATA_DIR` to persistent storage if your host supports it. This project does not require PostgreSQL, but JSON files are not ideal for a multi-instance setup. Run **one bot process** per shared data directory.

It is safe to give the source code to another developer. The `data/` folder and `.env` should not be included in public uploads.

## Discloud

The root contains `discloud.config` for a Node.js bot. Put a working `.env` next to it **only in your private deployment ZIP** (never in a public GitHub repo), and upload the ZIP to Discloud. The hosting service will install packages from `package.json` if supported by its Node.js deployment flow.

There is no `VLAN=true` or database dependency because this bot uses local files. If your Discloud environment does not preserve the `data/` directory across deployments, plan to export or back it up before updates.

## Developer checks

```bash
npm run check
npm test
```

Both commands are designed to work without connecting to Discord. Integration with a real Discord server, live permissions, and deployment still requires hands-on testing after installation.

## Troubleshooting

| Issue | What to check |
|---|---|
| Bot runs, but invites are not deleted | Message Content Intent, `/invites enable enabled:true`, Manage Messages permission, role/channel overrides |
| Messages are deleted from `#clan-ads` | `/invites allow channel:#clan-ads` using the correct channel |
| Commands do not appear | Invite with `applications.commands`, confirm the right `GUILD_ID`, reconnect the bot |
| Voice creation fails | Manage Channels, Move Members, category overwrite permissions, channel IDs in `/voice status` |
| Panel cannot be sent | The panel must be a normal text channel, and the bot needs Send Messages, Embed Links and Read Message History there |
| Room controls fail | Check bot permissions, user ownership, and that the button is in the currently configured panel channel |
| Settings disappear after redeploy | Use persistent `DATA_DIR` storage or restore a backed-up JSON file |

## License

MIT — see `LICENSE`. You may review, modify, and host the source code independently.
