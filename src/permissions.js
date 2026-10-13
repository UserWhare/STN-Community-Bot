'use strict';
const { PermissionFlagsBits } = require('discord.js');
function isAdmin(interaction) {
  return !!interaction.inGuild() && !!(
    interaction.guild.ownerId === interaction.user.id ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  );
}
function staffCanControl(member, settings) {
  if (!member) return false;
  return member.id === member.guild.ownerId ||
    member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    (member.roles?.cache?.some(role => settings.voice.staffRoleIds.includes(role.id)) ?? false);
}
function inviteBypass(message, settings) {
  const guild = message.guild;
  const member = message.member;
  if (settings.invites.staffBypass && member &&
      (member.id === guild.ownerId || member.permissions.has(PermissionFlagsBits.ManageMessages))) return true;
  return !!member?.roles?.cache?.some(role => settings.invites.bypassRoleIds.includes(role.id));
}
module.exports = { isAdmin, staffCanControl, inviteBypass };
