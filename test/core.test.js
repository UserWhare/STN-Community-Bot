'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discordInvites, safeRoomName, roomName, uniqAdd, uniqRemove } = require('../src/format');
const { Storage, freshDefaults } = require('../src/storage');

test('detects common Discord invite links with or without protocol', () => {
  const str = 'discord.gg/abc https://discord.com/invite/XYZ https://discordapp.com/invite/hi12';
  assert.equal(discordInvites(str).length, 3);
  assert.equal(discordInvites('https://roblox.com https://example.com').length, 0);
  assert.equal(discordInvites('DISCORD.GG/qwerty').length, 1);
});
test('user display names cannot ping users', () => {
  assert.equal(safeRoomName('@everyone @here'), 'player player');
  assert.equal(roomName('🔊 {user} #{number}', 'Kara', 3), '🔊 Kara #3');
  assert.ok(roomName('{user}', 'a'.repeat(300), 2).length <= 100);
});
test('role/channel ID list helpers are idempotent', () => {
  const list = ['1'];
  uniqAdd(list, '1'); uniqAdd(list, '2');
  assert.deepEqual(list, ['1', '2']);
  uniqRemove(list, '1'); uniqRemove(list, '1');
  assert.deepEqual(list, ['2']);
});
test('storage loads defaults, updates atomically and persists', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'community-bot-'));
  const id = '123456789012345678';
  try {
    const store = new Storage(dir);
    assert.equal(store.get(id).invites.enabled, false);
    assert.equal(store.get(id).invites.staffBypass, false);
    assert.equal(store.get(id).voice.enabled, false);
    store.update(id, d => { d.invites.allowedChannelIds.push('234567890123456789'); d.rooms['345678901234567890'] = {ownerId:'111', isPrivate:false}; });
    const reopened = new Storage(dir).get(id);
    assert.deepEqual(reopened.invites.allowedChannelIds, ['234567890123456789']);
    assert.equal(reopened.rooms['345678901234567890'].ownerId, '111');
    assert.deepEqual(fs.readdirSync(dir), [`${id}.json`]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
test('fresh defaults do not share mutable arrays', () => {
  const a=freshDefaults(), b=freshDefaults();
  a.invites.allowedChannelIds.push('234567890123456789');
  assert.deepEqual(b.invites.allowedChannelIds, []);
});
