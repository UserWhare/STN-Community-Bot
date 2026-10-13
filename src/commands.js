'use strict';
const {
  SlashCommandBuilder, ChannelType, PermissionFlagsBits,
  EmbedBuilder, MessageFlags
} = require('discord.js');
const { uniqAdd, uniqRemove, shortId } = require('./format');
const { isAdmin } = require('./permissions');
const voice = require('./voice');
const EPHEMERAL = MessageFlags.Ephemeral;

const commandData = [
  new SlashCommandBuilder().setName('about').setDescription('View this bot’s features and setup tips.'),
  new SlashCommandBuilder().setName('setup-voice').setDescription('Create or reuse a temporary voice lobby and control panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addChannelOption(o => o.setName('category').setDescription('Optional existing category').addChannelTypes(ChannelType.GuildCategory))
    .addChannelOption(o => o.setName('creator').setDescription('Optional existing voice creation channel').addChannelTypes(ChannelType.GuildVoice))
    .addChannelOption(o => o.setName('panel').setDescription('Optional existing text panel channel').addChannelTypes(ChannelType.GuildText)),
  new SlashCommandBuilder().setName('invites').setDescription('Configure automatic Discord invite-link protection.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(o => o.setName('status').setDescription('See invite protection settings.'))
    .addSubcommand(o => o.setName('enable').setDescription('Enable or disable invitation protection.')
      .addBooleanOption(x => x.setName('enabled').setDescription('Enabled?').setRequired(true)))
    .addSubcommand(o => o.setName('allow').setDescription('Allow invitation links in a channel and its threads.')
      .addChannelOption(x => x.setName('channel').setDescription('Allowed channel').setRequired(true)))
    .addSubcommand(o => o.setName('disallow').setDescription('Remove an allowed channel.')
      .addChannelOption(x => x.setName('channel').setDescription('Channel to remove').setRequired(true)))
    .addSubcommand(o => o.setName('role-add').setDescription('Let a role post invites anywhere.')
      .addRoleOption(x => x.setName('role').setDescription('Bypass role').setRequired(true)))
    .addSubcommand(o => o.setName('role-remove').setDescription('Remove an invite bypass role.')
      .addRoleOption(x => x.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand(o => o.setName('voice-text').setDescription('Allow invites in text chats attached to voice rooms.')
      .addBooleanOption(x => x.setName('enabled').setDescription('Allowed?').setRequired(true)))
    .addSubcommand(o => o.setName('staff-bypass').setDescription('Let moderators with Manage Messages bypass the filter.')
      .addBooleanOption(x => x.setName('enabled').setDescription('Bypass allowed?').setRequired(true)))
    .addSubcommand(o => o.setName('logs').setDescription('Choose a channel for filtered-invite logs.')
      .addChannelOption(x => x.setName('channel').setDescription('Log channel').setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(o => o.setName('logs-off').setDescription('Stop sending invite moderation logs.')),
  new SlashCommandBuilder().setName('voice').setDescription('Configure temporary voice rooms and their control panel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(o => o.setName('status').setDescription('See temporary voice settings.'))
    .addSubcommand(o => o.setName('enable').setDescription('Enable or disable temporary room creation.')
      .addBooleanOption(x => x.setName('enabled').setDescription('Enabled?').setRequired(true)))
    .addSubcommand(o => o.setName('creator').setDescription('Choose the voice channel players join to create rooms.')
      .addChannelOption(x => x.setName('channel').setDescription('Create Voice channel').setRequired(true).addChannelTypes(ChannelType.GuildVoice)))
    .addSubcommand(o => o.setName('category').setDescription('Choose a category for temporary voice rooms.')
      .addChannelOption(x => x.setName('channel').setDescription('Voice category').setRequired(true).addChannelTypes(ChannelType.GuildCategory)))
    .addSubcommand(o => o.setName('panel').setDescription('Choose a text channel and post the voice control panel.')
      .addChannelOption(x => x.setName('channel').setDescription('Panel channel').setRequired(true).addChannelTypes(ChannelType.GuildText)))
    .addSubcommand(o => o.setName('panel-refresh').setDescription('Refresh or resend the voice control panel.'))
    .addSubcommand(o => o.setName('name').setDescription('Set room name template. Use {user} and/or {number}.')
      .addStringOption(x => x.setName('template').setDescription('Example: 🔊 {user} • {number}').setRequired(true).setMaxLength(90)))
    .addSubcommand(o => o.setName('limit').setDescription('Set default room size; 0 means unlimited.')
      .addIntegerOption(x => x.setName('number').setDescription('0–99').setRequired(true).setMinValue(0).setMaxValue(99)))
    .addSubcommand(o => o.setName('staff-add').setDescription('Let a staff role control rooms they join.')
      .addRoleOption(x => x.setName('role').setDescription('Staff role').setRequired(true)))
    .addSubcommand(o => o.setName('staff-remove').setDescription('Remove a voice staff role.')
      .addRoleOption(x => x.setName('role').setDescription('Role').setRequired(true)))
    .addSubcommand(o => o.setName('cleanup').setDescription('Remove tracked temporary rooms that are empty.'))
].map(c => c.toJSON());

function ok(content) { return { content, flags: EPHEMERAL, allowedMentions: { parse: [] } }; }
function statusInvites(guild, data) {
  const v = data.invites;
  return new EmbedBuilder().setColor(v.enabled ? 0x57F287 : 0xFEE75C)
    .setTitle('Invite link protection')
    .addFields(
      { name: 'Status', value: v.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Voice channel text', value: v.allowVoiceChannelText ? 'Allowed' : 'Filtered', inline: true },
      { name: 'Moderator bypass', value: v.staffBypass ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Allowed channels', value: v.allowedChannelIds.map(shortId).join('\n') || 'None — add #clan-ads before enabling.' },
      { name: 'Bypass roles', value: v.bypassRoleIds.map(id => `<@&${id}>`).join(', ') || 'None' },
      { name: 'Logging', value: shortId(v.logChannelId) }
    ).setFooter({ text: `${guild.name} • Configure with /invites` });
}
function statusVoice(guild, data) {
  const v = data.voice;
  return new EmbedBuilder().setColor(v.enabled ? 0x57F287 : 0xFEE75C)
    .setTitle('Temporary voice rooms')
    .addFields(
      { name: 'Status', value: v.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Active tracked rooms', value: `${Object.keys(data.rooms).length}`, inline: true },
      { name: 'Default limit', value: v.defaultLimit ? `${v.defaultLimit} users` : 'Unlimited', inline: true },
      { name: 'Creation channel', value: shortId(v.creatorChannelId) },
      { name: 'Category', value: v.categoryId ? `<#${v.categoryId}>` : 'Not configured' },
      { name: 'Control panel', value: shortId(v.panelChannelId) },
      { name: 'Room naming', value: `\`${v.nameTemplate.replace(/`/g, "'")}\`` },
      { name: 'Voice staff roles', value: v.staffRoleIds.map(id => `<@&${id}>`).join(', ') || 'Manage Channels permission only' }
    ).setFooter({ text: `${guild.name} • Configure with /voice` });
}
async function setupVoice(interaction, storage) {
  const guild = interaction.guild;
  const d = storage.get(guild.id);
  const opt = interaction.options;
  let category = opt.getChannel('category') || (d.voice.categoryId && await guild.channels.fetch(d.voice.categoryId).catch(() => null));
  let creator = opt.getChannel('creator') || (d.voice.creatorChannelId && await guild.channels.fetch(d.voice.creatorChannelId).catch(() => null));
  let panelChannel = opt.getChannel('panel') || (d.voice.panelChannelId && await guild.channels.fetch(d.voice.panelChannelId).catch(() => null));
  await interaction.deferReply({ flags: EPHEMERAL });
  // Re-running setup reuses existing channels instead of duplicating them.
  if (!category) category = await guild.channels.create({ name: '🔊 VOICE ROOMS', type: ChannelType.GuildCategory, reason: 'Temporary voice setup' });
  if (!creator) creator = await guild.channels.create({ name: '➕ Create Voice', type: ChannelType.GuildVoice,
    parent: category.id, reason: 'Temporary voice setup' });
  if (!panelChannel) panelChannel = await guild.channels.create({ name: '🎛️-voice-controls', type: ChannelType.GuildText,
    parent: category.id, permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.SendMessages] },
      { id: guild.client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.ReadMessageHistory] }
    ],
    reason: 'Temporary voice setup' });
  if (creator.type !== ChannelType.GuildVoice || panelChannel.type !== ChannelType.GuildText) throw new Error('Please choose a voice creation channel and a regular text panel channel.');
  const changedPanel = d.voice.panelChannelId !== panelChannel.id;
  storage.update(guild.id, data => {
    data.voice.categoryId = category.id;
    data.voice.creatorChannelId = creator.id;
    data.voice.panelChannelId = panelChannel.id;
    if (changedPanel) data.voice.panelMessageId = null;
    data.voice.enabled = true;
  });
  const message = await voice.ensurePanel(guild, storage);
  await interaction.editReply({ content: `✅ Voice rooms configured!\n**Category:** <#${category.id}>\n**Create Voice:** <#${creator.id}>\n**Controls:** <#${panelChannel.id}> ([panel message](${message.url}))\n\nThe lobby is now active.`, allowedMentions: { parse: [] } });
}
async function inviteCommand(interaction, storage) {
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guildId;
  if (sub === 'status') return interaction.reply({ embeds: [statusInvites(interaction.guild, storage.get(gid))], flags: EPHEMERAL });
  const channel = interaction.options.getChannel('channel');
  const role = interaction.options.getRole('role');
  if (sub === 'allow' && channel.type === ChannelType.GuildCategory) return interaction.reply(ok('Choose a message channel, not a category.'));
  if (sub === 'role-add' && role.id === gid) return interaction.reply(ok('Do not bypass the entire @everyone role. Add a staff role instead.'));
  storage.update(gid, data => {
    const x = data.invites;
    switch (sub) {
      case 'enable': x.enabled = interaction.options.getBoolean('enabled'); break;
      case 'allow': uniqAdd(x.allowedChannelIds, channel.id); break;
      case 'disallow': uniqRemove(x.allowedChannelIds, channel.id); break;
      case 'role-add': uniqAdd(x.bypassRoleIds, role.id); break;
      case 'role-remove': uniqRemove(x.bypassRoleIds, role.id); break;
      case 'voice-text': x.allowVoiceChannelText = interaction.options.getBoolean('enabled'); break;
      case 'staff-bypass': x.staffBypass = interaction.options.getBoolean('enabled'); break;
      case 'logs': x.logChannelId = channel.id; break;
      case 'logs-off': x.logChannelId = null; break;
    }
  });
  return interaction.reply({ embeds: [statusInvites(interaction.guild, storage.get(gid))], flags: EPHEMERAL });
}
async function voiceCommand(interaction, storage) {
  const sub = interaction.options.getSubcommand();
  const gid = interaction.guildId;
  if (sub === 'status') return interaction.reply({ embeds: [statusVoice(interaction.guild, storage.get(gid))], flags: EPHEMERAL });
  if (sub === 'cleanup') {
    await interaction.deferReply({ flags: EPHEMERAL });
    const count = await voice.reconcile(interaction.guild, storage);
    return interaction.editReply({ content: `✅ Removed ${count} empty/missing tracked room(s).` });
  }
  if (sub === 'panel-refresh') {
    await interaction.deferReply({ flags: EPHEMERAL });
    const msg = await voice.ensurePanel(interaction.guild, storage);
    return interaction.editReply({ content: `✅ Voice controls are ready: ${msg.url}` });
  }
  const channel = interaction.options.getChannel('channel');
  const role = interaction.options.getRole('role');
  const name = interaction.options.getString('template');
  if (sub === 'enable' && interaction.options.getBoolean('enabled') && !storage.get(gid).voice.creatorChannelId) {
    return interaction.reply(ok('Run /setup-voice first, or configure a creator channel.'));
  }
  if (sub === 'staff-add' && role.id === gid) return interaction.reply(ok('Do not grant voice staff control to @everyone.'));
  const panelChanged = sub === 'panel' && storage.get(gid).voice.panelChannelId !== channel.id;
  storage.update(gid, data => {
    const v = data.voice;
    switch (sub) {
      case 'enable': v.enabled = interaction.options.getBoolean('enabled'); break;
      case 'creator': v.creatorChannelId = channel.id; break;
      case 'category': v.categoryId = channel.id; break;
      case 'panel': v.panelChannelId = channel.id; if (panelChanged) v.panelMessageId = null; break;
      case 'name': v.nameTemplate = name; break;
      case 'limit': v.defaultLimit = interaction.options.getInteger('number'); break;
      case 'staff-add': uniqAdd(v.staffRoleIds, role.id); break;
      case 'staff-remove': uniqRemove(v.staffRoleIds, role.id); break;
    }
  });
  if (sub === 'staff-add' || sub === 'staff-remove') {
    await interaction.deferReply({ flags: EPHEMERAL });
    let updated = 0, failed = 0;
    for (const id of Object.keys(storage.get(gid).rooms)) {
      const roomChannel = await interaction.guild.channels.fetch(id).catch(() => null);
      if (!roomChannel) continue;
      try {
        if (sub === 'staff-add') await roomChannel.permissionOverwrites.edit(role.id, {
          ViewChannel: true, Connect: true, MoveMembers: true
        });
        else await roomChannel.permissionOverwrites.delete(role.id);
        updated++;
      } catch (e) { failed++; console.warn(`[voice] Staff override ${id}: ${e.message}`); }
    }
    return interaction.editReply({
      content: `✅ Staff roles updated. Synced ${updated} active room(s).${failed ? ` Failed: ${failed} (check bot permissions).` : ''}`
    });
  }
  if (sub === 'panel') {
    await interaction.deferReply({ flags: EPHEMERAL });
    const m = await voice.ensurePanel(interaction.guild, storage);
    return interaction.editReply({ content: `✅ Panel moved to <#${channel.id}>: ${m.url}` });
  }
  return interaction.reply({ embeds: [statusVoice(interaction.guild, storage.get(gid))], flags: EPHEMERAL });
}
async function onCommand(interaction, storage) {
  if (!interaction.isChatInputCommand() || !interaction.inGuild()) return false;
  if (!['about', 'invites', 'voice', 'setup-voice'].includes(interaction.commandName)) return false;
  if (interaction.commandName === 'about') {
    await interaction.reply(ok('**Community Utilities**\n🛡️ Invite filter: allow invitations only in selected channels (such as #clan-ads) and optionally in voice text chats.\n🔊 Temporary voice rooms: join the creator lobby and control your own room from a button panel.\n\nAdmins: run `/invites status` and `/setup-voice` to get started.'));
    return true;
  }
  if (!isAdmin(interaction)) { await interaction.reply(ok('Manage Server permission is required.')); return true; }
  if (interaction.commandName === 'setup-voice') await setupVoice(interaction, storage);
  if (interaction.commandName === 'invites') await inviteCommand(interaction, storage);
  if (interaction.commandName === 'voice') await voiceCommand(interaction, storage);
  return true;
}
module.exports = { commandData, onCommand, statusInvites, statusVoice };
