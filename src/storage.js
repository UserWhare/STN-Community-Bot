'use strict';
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = Object.freeze({
  invites: {
    enabled: false,
    allowedChannelIds: [],
    bypassRoleIds: [],
    allowVoiceChannelText: true,
    staffBypass: false,
    logChannelId: null
  },
  voice: {
    enabled: false,
    categoryId: null,
    creatorChannelId: null,
    panelChannelId: null,
    panelMessageId: null,
    staffRoleIds: [],
    nameTemplate: "🔊・{user}'s Room {number}",
    defaultLimit: 0
  },
  rooms: {}
});
function freshDefaults() { return JSON.parse(JSON.stringify(DEFAULTS)); }
function hydrate(value) {
  const d = freshDefaults();
  if (!value || typeof value !== 'object') return d;
  for (const type of ['invites', 'voice']) {
    if (value[type] && typeof value[type] === 'object' && !Array.isArray(value[type])) {
      for (const key of Object.keys(d[type])) {
        if (value[type][key] !== undefined && typeof value[type][key] === typeof d[type][key]) {
          d[type][key] = value[type][key];
        } else if (d[type][key] === null && (value[type][key] === null || typeof value[type][key] === 'string')) {
          d[type][key] = value[type][key];
        }
      }
    }
  }
  for (const key of ['allowedChannelIds', 'bypassRoleIds']) {
    d.invites[key] = [...new Set(d.invites[key].filter(x => /^\d{16,22}$/.test(x)))];
  }
  d.voice.staffRoleIds = [...new Set(d.voice.staffRoleIds.filter(x => /^\d{16,22}$/.test(x)))];
  if (value.rooms && typeof value.rooms === 'object' && !Array.isArray(value.rooms)) d.rooms = value.rooms;
  return d;
}
class Storage {
  constructor(root = path.join(process.cwd(), 'data')) {
    this.root = path.resolve(root);
    fs.mkdirSync(this.root, { recursive: true });
    this.cache = new Map();
  }
  file(guildId) {
    if (!/^\d{16,22}$/.test(String(guildId))) throw new Error('Invalid server ID');
    return path.join(this.root, `${guildId}.json`);
  }
  get(guildId) {
    if (!this.cache.has(guildId)) {
      let data;
      try { data = JSON.parse(fs.readFileSync(this.file(guildId), 'utf8')); }
      catch (e) { if (e.code !== 'ENOENT') throw e; }
      this.cache.set(guildId, hydrate(data));
    }
    return this.cache.get(guildId);
  }
  save(guildId) {
    const file = this.file(guildId);
    // Atomic replace: never expose a partially written JSON document.
    const temp = `${file}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(this.get(guildId), null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(temp, file);
    } catch (e) {
      try { fs.unlinkSync(temp); } catch (_) {}
      throw e;
    }
  }
  update(guildId, fn) {
    const data = this.get(guildId);
    fn(data);
    this.save(guildId);
    return data;
  }
}
module.exports = { Storage, DEFAULTS, freshDefaults, hydrate };
