'use strict';
require('dotenv').config();
const path = require('node:path');
const { Client, GatewayIntentBits, Events, PermissionFlagsBits, Partials } = require('discord.js');
const { Storage } = require('./storage');
const { onMessage } = require('./invites');
const voice = require('./voice');
const { commandData, onCommand } = require('./commands');

const token = process.env.DISCORD_TOKEN;
if (!token || token === 'PUT_YOUR_BOT_TOKEN_HERE') {
  console.error('[bot] DISCORD_TOKEN is missing. Copy .env.example to .env and set your own token.');
  process.exit(1);
}
const configuredGuildId = (process.env.GUILD_ID || '').trim();
if (configuredGuildId && !/^\d{16,22}$/.test(configuredGuildId)) {
  console.error('[bot] GUILD_ID must be a Discord server ID or blank.');
  process.exit(1);
}
const storage = new Storage(path.resolve(process.env.DATA_DIR || './data'));
const client = new Client({ intents: [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,
  GatewayIntentBits.GuildVoiceStates
], partials: [Partials.Message] });
function authorized(guildId) { return !!guildId && (!configuredGuildId || guildId === configuredGuildId); }

client.on(Events.ClientReady, async bot => {
  console.log(`[bot] Logged in as ${bot.user.tag}. Connected guilds: ${bot.guilds.cache.size}`);
  for (const guild of bot.guilds.cache.values()) {
    if (!authorized(guild.id)) continue;
    try {
      await guild.commands.set(commandData);
      const botMember = guild.members.me || await guild.members.fetchMe();
      const requested = [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks];
      const missing = requested.filter(bit => !botMember.permissions.has(bit));
      if (missing.length) console.warn(`[bot] Warning: Missing ${missing.length} recommended permissions in ${guild.name}.`);
      console.log(`[bot] Commands ready in ${guild.name} (${guild.id})`);
      // Give Discord voice-state caches time to populate after reconnect.
      setTimeout(() => voice.reconcile(guild, storage)
        .then(count => count && console.log(`[voice] Reconciled ${count} empty/missing rooms in ${guild.name}`))
        .catch(e => console.warn(`[voice] Reconcile error in ${guild.id}:`, e.message)), 15000);
    } catch (e) { console.error(`[bot] Setup failed in guild ${guild.id}:`, e.message); }
  }
});
client.on(Events.GuildCreate, guild => {
  if (authorized(guild.id)) guild.commands.set(commandData).catch(e => console.warn(`[commands] ${guild.id}:`, e.message));
});
client.on(Events.MessageCreate, msg => {
  if (authorized(msg.guildId)) onMessage(msg, storage).catch(e => console.error('[invites]', e));
});
client.on(Events.MessageUpdate, (_oldMessage, newMessage) => {
  if (!authorized(newMessage.guildId)) return;
  (async () => {
    const resolved = newMessage.partial ? await newMessage.fetch() : newMessage;
    await onMessage(resolved, storage);
  })().catch(e => console.error('[invites] Edited message:', e));
});
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  if (authorized(newState.guild.id)) voice.onVoiceState(oldState, newState, storage).catch(e => console.error('[voice]', e));
});
client.on(Events.ChannelDelete, channel => {
  const id = channel.guildId;
  if (!authorized(id)) return;
  const state = storage.get(id);
  if (state.rooms[channel.id]) storage.update(id, d => delete d.rooms[channel.id]);
});
client.on(Events.InteractionCreate, async interaction => {
  if (!authorized(interaction.guildId)) return;
  try {
    if (interaction.isChatInputCommand()) await onCommand(interaction, storage);
    else if (interaction.isButton() || interaction.isModalSubmit() || interaction.isUserSelectMenu()) await voice.onComponent(interaction, storage);
  } catch (e) {
    console.error('[bot] Interaction error:', e);
    const data = { content: 'Something went wrong. Please check bot permissions or contact a server admin.', flags: 64, allowedMentions: { parse: [] } };
    try { if (interaction.deferred || interaction.replied) await interaction.followUp(data); else await interaction.reply(data); }
    catch (_) { /* Expired interaction token or already handled */ }
  }
});
client.on(Events.Error, e => console.error('[discord] Client error:', e));
process.on('unhandledRejection', e => console.error('[runtime] Unhandled rejection:', e));
process.on('SIGINT', () => { console.log('[bot] Shutting down'); client.destroy(); process.exit(0); });
process.on('SIGTERM', () => { console.log('[bot] Shutting down'); client.destroy(); process.exit(0); });
client.login(token).catch(e => { console.error('[bot] Login failed:', e.message); process.exitCode = 1; });
