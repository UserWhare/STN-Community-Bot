'use strict';
const INVITE_PATTERN = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg\/|discord(?:app)?\.com\/invite\/)([a-z0-9_-]+)/gi;
function discordInvites(message) {
  if (typeof message !== 'string') return [];
  return Array.from(message.matchAll(INVITE_PATTERN), match => match[0]);
}
function safeRoomName(name) {
  return (name || 'Player')
    .replace(/@everyone|@here/gi, 'player')
    .replace(/<[@#&!][^>]+>/g, '')
    .replace(/[\r\n\t]/g, ' ')
    .trim().slice(0, 36) || 'Player';
}
function roomName(template, username, number) {
  return (template || "🔊・{user}'s Room {number}")
    .replaceAll('{user}', safeRoomName(username))
    .replaceAll('{number}', String(number))
    .slice(0, 100);
}
function uniqAdd(arr, id) { if (!arr.includes(id)) arr.push(id); }
function uniqRemove(arr, id) { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); }
function shortId(id) { return id ? `<#${id}>` : 'Not configured'; }
module.exports = { discordInvites, safeRoomName, roomName, uniqAdd, uniqRemove, shortId };
