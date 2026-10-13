'use strict';
const { ChannelType, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { discordInvites } = require('./format');
const { inviteBypass } = require('./permissions');
function allowChannel(channel, settings) {
  if (!channel) return false;
  if (settings.invites.allowedChannelIds.includes(channel.id)) return true;
  if (channel.isThread?.() && settings.invites.allowedChannelIds.includes(channel.parentId)) return true;
  if (settings.invites.allowVoiceChannelText &&
      [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) return true;
  return false;
}
async function onMessage(message, storage, logger = console) {
  if (!message.inGuild?.() || !message.author || message.author.bot || message.webhookId) return;
  const settings = storage.get(message.guildId);
  if (!settings.invites.enabled || !discordInvites(message.content).length) return;
  if (allowChannel(message.channel, settings) || inviteBypass(message, settings)) return;
  if (!message.guild.members.me?.permissionsIn(message.channel).has(PermissionFlagsBits.ManageMessages)) {
    logger.warn(`[invites] Missing Manage Messages in #${message.channel.name} (${message.guildId})`);
    return;
  }
  try { await message.delete(); }
  catch (err) { logger.warn(`[invites] Could not delete message: ${err.message}`); return; }
  logger.info?.(`[invites] Removed unauthorized invitation from ${message.author.id} in ${message.guildId}/${message.channelId}`);
  const logId = settings.invites.logChannelId;
  if (!logId) return;
  const channel = await message.guild.channels.fetch(logId).catch(() => null);
  if (!channel?.isTextBased?.() || !channel.send) return;
  const embed = new EmbedBuilder()
    .setColor(0xE74C3C)
    .setTitle('Invite link removed')
    .setDescription(`**Member:** <@${message.author.id}>\n**Channel:** <#${message.channelId}>\n**Reason:** Discord invitation outside an allowed channel.`)
    .setTimestamp()
    .setFooter({ text: 'Community Moderation' });
  await channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(e => logger.warn(`[invites] Log delivery failed: ${e.message}`));
}
module.exports = { onMessage, allowChannel };
