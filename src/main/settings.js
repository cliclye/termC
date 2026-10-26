const path = require('node:path');
const { safeStorage } = require('electron');
const { TERMC_HOME, readJSON, writeJSON } = require('./util');

const FILE = path.join(TERMC_HOME, 'settings.json');
const SECRET_KEYS = ['anthropicKey', 'openaiKey'];

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
  screenshotShortcut: 'CommandOrControl+Shift+S',
  enabledPlugins: {},
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
  cache = { ...DEFAULTS, ...raw, ai: { ...DEFAULTS.ai, ...(raw.ai || {}) } };
  for (const k of SECRET_KEYS) cache.ai[k] = decrypt(cache.ai[k]);
  return cache;
}

function save(next) {
  cache = { ...load(), ...next, ai: { ...load().ai, ...(next.ai || {}) } };
  const onDisk = { ...cache, ai: { ...cache.ai } };
  for (const k of SECRET_KEYS) onDisk.ai[k] = encrypt(cache.ai[k]);
  writeJSON(FILE, onDisk);
  return cache;
}

module.exports = { load, save, DEFAULTS };
