'use strict';
const {
  ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, ModalBuilder,
  TextInputBuilder, TextInputStyle, MessageFlags
} = require('discord.js');
const { roomName } = require('./format');
const { staffCanControl } = require('./permissions');

const EPHEMERAL = MessageFlags.Ephemeral;
const CONTROLS = {
  limit:    ['Limit', '👥', 'Change the maximum number of users'],
  privacy:  ['Privacy', '🔒', 'Switch between public and private'],
  delete:   ['Delete', '🗑️', 'Delete your temporary room'],
  unlock:   ['Unblock', '🔓', 'Restore a blocked member’s access'],
  block:    ['Block', '🚫', 'Prevent someone from joining'],
  trust:    ['Trust', '✅', 'Allow someone into private rooms'],
  kick:     ['Kick', '📞', 'Disconnect a member from your room'],
  untrust:  ['Untrust', '❌', 'Remove someone’s trusted access'],
  transfer: ['Transfer', '👑', 'Give room ownership to someone else']
};
const USER_ACTIONS = new Set(['unlock', 'block', 'trust', 'kick', 'untrust', 'transfer']);
const ownerPermissions = { ViewChannel: true, Connect: true, Speak: true, Stream: true };
const activeCreators = new Set();
const scheduledCleanups = new Set();

function pickEmoji(action) {
  const raw = process.env[`VOICE_EMOJI_${action.toUpperCase()}`] || CONTROLS[action][1];
  const match = /^<(a?):([\w-]+):(\d{16,22})>$/.exec(raw);
  return match ? { id: match[3], name: match[2], animated: !!match[1] } : raw;
}
function emojiLabel(action) {
  return process.env[`VOICE_EMOJI_${action.toUpperCase()}`] || CONTROLS[action][1];
}
function panel() {
  const embed = new EmbedBuilder().setColor(0x5AC9E8)
    .setTitle('VOICE CHANNEL CONTROL')
    .setDescription([
      'Join **➕ Create Voice** to get your own room. The room disappears automatically when everyone leaves.',
      '',
      '**ROOM CONTROLS**',
      ...Object.entries(CONTROLS).map(([name, [, , explanation]]) => `${emojiLabel(name)} **${CONTROLS[name][0]}** — ${explanation}`),
      '',
      '> You control your own room. Server staff may manage the room they are currently in.'
    ].join('\n'))
    .setFooter({ text: 'Temporary Voice Rooms • Community Utilities' });
  const order = [
    ['limit', 'privacy', 'delete'],
    ['unlock', 'block', 'trust'],
    ['kick', 'untrust', 'transfer']
  ];
  const components = order.map(row => new ActionRowBuilder().addComponents(...row.map(action =>
    new ButtonBuilder().setCustomId(`vr:btn:${action}`)
      .setStyle(action === 'delete' ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setEmoji(pickEmoji(action)).setLabel(CONTROLS[action][0])
  )));
  return { embeds: [embed], components, allowedMentions: { parse: [] } };
}
async function ensurePanel(guild, storage) {
  const config = storage.get(guild.id);
  if (!config.voice.panelChannelId) throw new Error('Set a voice control panel channel first.');
  const channel = await guild.channels.fetch(config.voice.panelChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) throw new Error('The voice panel must be a regular text channel.');
  let message = null;
  if (config.voice.panelMessageId) {
    message = await channel.messages.fetch(config.voice.panelMessageId).catch(() => null);
  }
  if (message && message.author.id === guild.client.user.id) await message.edit(panel());
  else {
    message = await channel.send(panel());
    config.voice.panelMessageId = message.id;
    storage.save(guild.id);
  }
  return message;
}
function recordedRoom(storage, guildId, id) { return storage.get(guildId).rooms[id] || null; }
function ownedRoom(storage, guildId, userId) {
  const rooms = storage.get(guildId).rooms;
  const found = Object.entries(rooms).find(([, r]) => r.ownerId === userId);
  return found ? { channelId: found[0], data: found[1] } : null;
}
async function cleanupRoom(guild, storage, roomId) {
  if (!recordedRoom(storage, guild.id, roomId)) return false;
  const channel = await guild.channels.fetch(roomId).catch(() => null);
  if (!channel) { storage.update(guild.id, d => delete d.rooms[roomId]); return true; }
  if (channel.type !== ChannelType.GuildVoice || channel.members.size) return false;
  try { await channel.delete('Temporary voice room is empty'); }
  catch (e) { console.warn(`[voice] Could not delete empty room ${roomId}: ${e.message}`); return false; }
  storage.update(guild.id, d => delete d.rooms[roomId]);
  return true;
}
function queueCleanup(guild, storage, roomId) {
  if (!recordedRoom(storage, guild.id, roomId) || scheduledCleanups.has(roomId)) return;
  scheduledCleanups.add(roomId);
  setTimeout(async () => {
    try { await cleanupRoom(guild, storage, roomId); }
    catch (e) { console.error(`[voice] Cleanup ${roomId}:`, e); }
    finally { scheduledCleanups.delete(roomId); }
  }, 1500);
}
async function onVoiceState(oldState, newState, storage) {
  const guild = newState.guild;
  const voice = storage.get(guild.id).voice;
  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    queueCleanup(guild, storage, oldState.channelId);
  }
  if (!voice.enabled || !voice.creatorChannelId ||
      newState.channelId !== voice.creatorChannelId ||
      oldState.channelId === voice.creatorChannelId || newState.member?.user.bot) return;

  const userId = newState.id;
  const lock = `${guild.id}:${userId}`;
  if (activeCreators.has(lock)) return;
  activeCreators.add(lock);
  let channel = null;
  try {
    const current = ownedRoom(storage, guild.id, userId);
    if (current) {
      const oldChannel = await guild.channels.fetch(current.channelId).catch(() => null);
      if (oldChannel?.type === ChannelType.GuildVoice) {
        await newState.setChannel(oldChannel, 'Rejoin your temporary room');
        return;
      }
      storage.update(guild.id, d => delete d.rooms[current.channelId]);
    }
    if (guild.voiceStates.cache.get(userId)?.channelId !== voice.creatorChannelId) return;
    const parent = voice.categoryId || newState.channel?.parentId || null;
    const member = newState.member || await guild.members.fetch(userId);
    const staffRoles = voice.staffRoleIds.map(id => guild.roles.cache.get(id)).filter(Boolean);
    const overrides = [
      { id: guild.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
      { id: userId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak, PermissionFlagsBits.Stream] },
      ...staffRoles.map(role => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers] }))
    ];
    const existing = new Set(Object.values(storage.get(guild.id).rooms).map(r => r.roomNumber));
    let number = 1;
    while (existing.has(number)) number++;
    channel = await guild.channels.create({
      name: roomName(voice.nameTemplate, member.displayName, number),
      type: ChannelType.GuildVoice, parent, userLimit: voice.defaultLimit,
      permissionOverwrites: overrides,
      reason: `Temporary room for ${userId}`
    });
    storage.update(guild.id, d => { d.rooms[channel.id] = {
      ownerId: userId, roomNumber: number, isPrivate: false, trustedIds: [], blockedIds: [], createdAt: Date.now()
    }; });
    if (guild.voiceStates.cache.get(userId)?.channelId !== voice.creatorChannelId) {
      await cleanupRoom(guild, storage, channel.id); return;
    }
    await newState.setChannel(channel, 'Created your temporary room');
  } catch (e) {
    console.error(`[voice] Creating room for ${userId}:`, e);
    if (channel) {
      await channel.delete().catch(() => {});
      storage.update(guild.id, d => delete d.rooms[channel.id]);
    }
  } finally { activeCreators.delete(lock); }
}
async function controlledRoom(interaction, storage) {
  const guild = interaction.guild;
  const config = storage.get(guild.id);
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return null;
  const current = member.voice.channelId;
  if (current && recordedRoom(storage, guild.id, current) && staffCanControl(member, config)) {
    return { channelId: current, data: recordedRoom(storage, guild.id, current) };
  }
  return ownedRoom(storage, guild.id, member.id);
}
function response(content) { return { content, flags: EPHEMERAL, allowedMentions: { parse: [] } }; }
async function getAuthorizedRoom(interaction, storage, roomId) {
  const controlled = await controlledRoom(interaction, storage);
  return controlled?.channelId === roomId ? controlled : null;
}
async function userAction(interaction, storage, action, roomId, targetId) {
  const room = await getAuthorizedRoom(interaction, storage, roomId);
  if (!room) return interaction.reply(response('You can no longer manage that room.'));
  const guild = interaction.guild;
  const channel = await guild.channels.fetch(roomId).catch(() => null);
  if (!channel) return interaction.reply(response('That room no longer exists.'));
  const target = await guild.members.fetch(targetId).catch(() => null);
  if (!target) return interaction.reply(response('That player is not in this server.'));
  const config = storage.get(guild.id);
  const protectedTarget = staffCanControl(target, config);
  if (['block', 'kick'].includes(action) && protectedTarget) return interaction.reply(response('You cannot block or kick server staff.'));
  if (['block', 'kick'].includes(action) && targetId === room.data.ownerId) return interaction.reply(response('You cannot block or kick the room owner.'));

  if (action === 'block') {
    await channel.permissionOverwrites.edit(targetId, { ViewChannel: true, Connect: false });
    if (target.voice.channelId === roomId) await target.voice.disconnect('Blocked from temporary room');
    storage.update(guild.id, d => {
      d.rooms[roomId].trustedIds = d.rooms[roomId].trustedIds.filter(id => id !== targetId);
      if (!d.rooms[roomId].blockedIds.includes(targetId)) d.rooms[roomId].blockedIds.push(targetId);
    });
  } else if (action === 'unlock') {
    if (!room.data.blockedIds.includes(targetId)) return interaction.reply(response('This member is not blocked.'));
    await channel.permissionOverwrites.delete(targetId);
    storage.update(guild.id, d => { d.rooms[roomId].blockedIds = d.rooms[roomId].blockedIds.filter(id => id !== targetId); });
  } else if (action === 'trust') {
    if (targetId === room.data.ownerId) return interaction.reply(response('The owner already has access.'));
    await channel.permissionOverwrites.edit(targetId, { ViewChannel: true, Connect: true });
    storage.update(guild.id, d => {
      d.rooms[roomId].blockedIds = d.rooms[roomId].blockedIds.filter(id => id !== targetId);
      if (!d.rooms[roomId].trustedIds.includes(targetId)) d.rooms[roomId].trustedIds.push(targetId);
    });
  } else if (action === 'untrust') {
    if (!room.data.trustedIds.includes(targetId)) return interaction.reply(response('This member is not trusted.'));
    await channel.permissionOverwrites.delete(targetId);
    storage.update(guild.id, d => { d.rooms[roomId].trustedIds = d.rooms[roomId].trustedIds.filter(id => id !== targetId); });
  } else if (action === 'kick') {
    if (target.voice.channelId !== roomId) return interaction.reply(response('This member is not in your room.'));
    await target.voice.disconnect('Removed from temporary room by its owner');
  } else if (action === 'transfer') {
    if (target.user.bot) return interaction.reply(response('You cannot transfer ownership to a bot.'));
    if (targetId === room.data.ownerId) return interaction.reply(response('That member already owns this room.'));
    if (ownedRoom(storage, guild.id, targetId)) return interaction.reply(response('That member already owns another room.'));
    await channel.permissionOverwrites.edit(targetId, ownerPermissions);
    await channel.permissionOverwrites.delete(room.data.ownerId).catch(() => {});
    storage.update(guild.id, d => {
      const r = d.rooms[roomId];
      r.ownerId = targetId;
      r.blockedIds = r.blockedIds.filter(id => id !== targetId);
      r.trustedIds = r.trustedIds.filter(id => id !== targetId);
    });
  }
  const done = { block: 'blocked', unlock: 'unblocked', trust: 'trusted', untrust: 'untrusted', kick: 'kicked', transfer: 'made the new room owner' };
  await interaction.reply(response(`✅ <@${targetId}> was ${done[action]}.`));
}
async function onComponent(interaction, storage) {
  if (!interaction.inGuild() || !interaction.customId?.startsWith('vr:')) return false;
  const guild = interaction.guild;
  const voice = storage.get(guild.id).voice;
  if (!voice.enabled) { await interaction.reply(response('Temporary voice rooms are currently disabled.')); return true; }
  const [, type, action, roomId] = interaction.customId.split(':');

  try {
    if (type === 'btn' && interaction.isButton()) {
      // Reject obsolete buttons in other channels.
      if (interaction.channelId !== voice.panelChannelId) {
        await interaction.reply(response('Use the current voice control panel.')); return true;
      }
      const room = await controlledRoom(interaction, storage);
      if (!room) { await interaction.reply(response('Create a room first, or join a room as staff.')); return true; }
      if (action === 'privacy') {
        const channel = await guild.channels.fetch(room.channelId).catch(() => null);
        if (!channel) { await interaction.reply(response('Room not found.')); return true; }
        const next = !room.data.isPrivate;
        await channel.permissionOverwrites.edit(guild.id, { ViewChannel: true, Connect: !next });
        storage.update(guild.id, d => { d.rooms[room.channelId].isPrivate = next; });
        await interaction.reply(response(next ? '🔒 Your room is now **private**. Only trusted users and staff can join.' : '🔓 Your room is now **public**.'));
      } else if (action === 'limit') {
        const modal = new ModalBuilder().setCustomId(`vr:modal:limit:${room.channelId}`).setTitle('Room user limit')
          .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder()
            .setCustomId('value').setLabel('Maximum users (0 = unlimited)')
            .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setPlaceholder('0–99')));
        await interaction.showModal(modal);
      } else if (action === 'delete') {
        await interaction.reply({ ...response('Delete your temporary voice room? This cannot be undone.'),
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`vr:confirm:delete:${room.channelId}`).setLabel('Delete room').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`vr:confirm:cancel:${room.channelId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
          )] });
      } else if (USER_ACTIONS.has(action)) {
        const select = new UserSelectMenuBuilder().setCustomId(`vr:user:${action}:${room.channelId}`)
          .setPlaceholder(`Select a member to ${CONTROLS[action][0].toLowerCase()}`).setMinValues(1).setMaxValues(1);
        await interaction.reply({ ...response('Choose a server member:'),
          components: [new ActionRowBuilder().addComponents(select)] });
      } else await interaction.reply(response('Unknown control.'));
      return true;
    }
    if (type === 'modal' && interaction.isModalSubmit() && action === 'limit') {
      const room = await getAuthorizedRoom(interaction, storage, roomId);
      if (!room) { await interaction.reply(response('You can no longer manage that room.')); return true; }
      const text = interaction.fields.getTextInputValue('value').trim();
      if (!/^(?:[0-9]|[1-9][0-9])$/.test(text)) {
        await interaction.reply(response('Enter a whole number from 0 to 99.')); return true;
      }
      const channel = await guild.channels.fetch(roomId).catch(() => null);
      if (!channel) { await interaction.reply(response('Room not found.')); return true; }
      await channel.setUserLimit(Number(text));
      await interaction.reply(response(`✅ User limit set to **${text === '0' ? 'unlimited' : text}**.`));
      return true;
    }
    if (type === 'user' && interaction.isUserSelectMenu() && USER_ACTIONS.has(action)) {
      await userAction(interaction, storage, action, roomId, interaction.values[0]); return true;
    }
    if (type === 'confirm' && interaction.isButton()) {
      if (action === 'cancel') { await interaction.update({ content: 'Cancelled.', components: [] }); return true; }
      if (action !== 'delete') return true;
      const room = await getAuthorizedRoom(interaction, storage, roomId);
      if (!room) { await interaction.update({ content: 'You can no longer manage that room.', components: [] }); return true; }
      const channel = await guild.channels.fetch(roomId).catch(() => null);
      if (channel) await channel.delete('Deleted by temporary room owner');
      storage.update(guild.id, d => delete d.rooms[roomId]);
      await interaction.update({ content: '✅ Room deleted.', components: [] });
      return true;
    }
    return true;
  } catch (e) {
    console.error('[voice] Control error:', e);
    if (interaction.replied || interaction.deferred) await interaction.followUp(response('Something went wrong. Check my permissions and try again.')).catch(() => {});
    else await interaction.reply(response('Something went wrong. Check my permissions and try again.')).catch(() => {});
    return true;
  }
}
async function reconcile(guild, storage) {
  let cleaned = 0;
  for (const id of Object.keys(storage.get(guild.id).rooms)) {
    if (await cleanupRoom(guild, storage, id)) cleaned++;
  }
  return cleaned;
}
module.exports = { onVoiceState, onComponent, ensurePanel, cleanupRoom, reconcile, panel, CONTROLS };
