const path = require('node:path');
const { safeStorage } = require('electron');
const { TERMC_HOME, readJSON, writeJSON } = require('./util');

const FILE = path.join(TERMC_HOME, 'settings.json');
const SECRET_KEYS = ['anthropicKey', 'openaiKey'];
const VERSION = 2;
// ⇧⌘S is "Save As" in most Mac apps, so the system-wide shortcut defaults to ⌃⇧⌘S instead.
// (Inside TermC, ⇧⌘S still takes a screenshot.)
const OLD_SHOT = 'CommandOrControl+Shift+S';
const DEFAULT_SHOT = 'Control+Shift+CommandOrControl+S';

const DEFAULTS = {
  theme: 'termc-dark',
  fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
  fontSize: 13,
  lineHeight: 1.25,
  cursorStyle: 'bar',
  cursorBlink: true,
  scrollback: 10000,
  optionAsMeta: false,
  shell: process.env.SHELL || '/bin/zsh',
  restoreSessions: true,
  confirmQuit: true,
  copyOnSelect: false,
  ai: {
    provider: 'auto',
    anthropicModel: 'claude-haiku-5-5',
    openaiBaseUrl: 'https://api.openai.com/v1',
    openaiModel: 'gpt-4o-mini',
    ollamaModel: 'llama3.2',
    anthropicKey: '',
    openaiKey: '',
  },
  screenshotShortcut: DEFAULT_SHOT,
  settingsVersion: VERSION,
  enabledPlugins: {},
  spotify: {
    enabled: true,
    statusBar: true,
    // Spotify's own coding/focus playlists; users can add and remove their own.
    favorites: [
      { name: 'Lofi Beats', uri: 'spotify:playlist:37i9dQZF1DWWQRwui0ExPn' },
      { name: 'Deep Focus', uri: 'spotify:playlist:37i9dQZF1DWZeKCadgRdKQ' },
      { name: 'Coding Mode', uri: 'spotify:playlist:37i9dQZF1DX5trt9i14X7j' },
      { name: 'Brain Food', uri: 'spotify:playlist:37i9dQZF1DWXLeA8Omikj7' },
      { name: 'Peaceful Piano', uri: 'spotify:playlist:37i9dQZF1DX4sWSpwq3LiO' },
    ],
  },
};

let cache = null;

function decrypt(v) {
  if (!v || typeof v !== 'string' || !v.startsWith('enc:')) return v || '';
  try {
    return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64'));
  } catch {
    return '';
  }
}

function encrypt(v) {
  if (!v) return '';
  if (!safeStorage.isEncryptionAvailable()) return v;
  return 'enc:' + safeStorage.encryptString(v).toString('base64');
}

function load() {
  if (cache) return cache;
  const raw = readJSON(FILE, {});
  cache = { ...DEFAULTS, ...raw, ai: { ...DEFAULTS.ai, ...(raw.ai || {}) }, spotify: { ...DEFAULTS.spotify, ...(raw.spotify || {}) } };
  for (const k of SECRET_KEYS) cache.ai[k] = decrypt(cache.ai[k]);
  if (!(raw.settingsVersion >= 2)) {
    if (cache.screenshotShortcut === OLD_SHOT) cache.screenshotShortcut = DEFAULT_SHOT;
    cache.settingsVersion = VERSION;
  }
  // Keep numeric settings in a range xterm accepts even if the file was hand-edited.
  cache.fontSize = clamp(cache.fontSize, 8, 32, 13);
  cache.scrollback = clamp(cache.scrollback, 500, 200000, 10000);
  cache.lineHeight = clamp(cache.lineHeight, 1, 2, 1.25);
  if (!Array.isArray(cache.spotify.favorites)) cache.spotify.favorites = DEFAULTS.spotify.favorites;
  return cache;
}

function clamp(v, lo, hi, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

function save(next) {
  cache = { ...load(), ...next, ai: { ...load().ai, ...(next.ai || {}) }, spotify: { ...load().spotify, ...(next.spotify || {}) } };
  cache.fontSize = clamp(cache.fontSize, 8, 32, 13);
  cache.scrollback = clamp(cache.scrollback, 500, 200000, 10000);
  cache.lineHeight = clamp(cache.lineHeight, 1, 2, 1.25);
  const onDisk = { ...cache, ai: { ...cache.ai } };
  for (const k of SECRET_KEYS) onDisk.ai[k] = encrypt(cache.ai[k]);
  writeJSON(FILE, onDisk);
  return cache;
}

module.exports = { load, save, DEFAULTS };
