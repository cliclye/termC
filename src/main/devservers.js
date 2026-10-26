// Watches terminal output for local dev-server URLs, labels the framework, and drops
// servers once their port stops accepting connections.
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { stripAnsi } = require('./util');

const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]|[\w-]+\.localhost)(?::(\d{2,5}))?(?:\/[^\s'"`<>)\]]*)?/g;

const FRAMEWORKS = [
  ['Next.js', /next\.js|▲ next/i],
  ['Nuxt', /nuxt/i],
  ['Angular', /angular|ng serve/i],
  ['SvelteKit', /sveltekit|svelte/i],
  ['Astro', /astro/i],
  ['Remix', /remix/i],
  ['Vite', /vite/i],
  ['Webpack', /webpack/i],
  ['Storybook', /storybook/i],
  ['Django', /django|starting development server/i],
  ['Flask', /flask|running on http/i],
  ['Rails', /rails|puma/i],
  ['Expo', /expo/i],
];

function probe(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port, timeout: 800 });
    const done = (ok) => {
      s.destroy();
      resolve(ok);
    };
    s.once('connect', () => done(true));
    s.once('error', () => {
      const s6 = net.connect({ host: '::1', port, timeout: 800 });
      s6.once('connect', () => (s6.destroy(), resolve(true)));
      s6.once('error', () => (s6.destroy(), resolve(false)));
      s6.once('timeout', () => (s6.destroy(), resolve(false)));
      s.destroy();
    });
    s.once('timeout', () => done(false));
  });
}

class DevServers extends EventEmitter {
  constructor() {
    super();
    this.servers = new Map(); // key `${paneId}:${port}`
    this.recent = new Map(); // paneId -> recent plain text
    setInterval(() => this.sweep(), 4000);
  }

  feed(paneId, data) {
    const text = ((this.recent.get(paneId) || '') + stripAnsi(data)).slice(-4000);
    this.recent.set(paneId, text);
    const plain = stripAnsi(data);
    let m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(plain))) {
      const port = Number(m[1] || (m[0].startsWith('https') ? 443 : 80));
      if (!port || port < 1024) continue;
      const key = `${paneId}:${port}`;
      if (this.servers.has(key)) continue;
      const url = m[0].replace('0.0.0.0', 'localhost').replace(/[.,;:]+$/, '');
      const framework = (FRAMEWORKS.find(([, re]) => re.test(text)) || ['Dev server'])[0];
      const server = { key, paneId, port, url, framework, detectedAt: Date.now(), alive: false };
      this.servers.set(key, server);
      this.check(server);
    }
  }

  async check(server) {
    // Servers often print their URL a moment before listening; retry for a few seconds.
    for (let i = 0; i < 10; i++) {
      if (!this.servers.has(server.key)) return;
      if (await probe(server.port)) {
        server.alive = true;
        this.emit('change', this.list());
        return;
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    this.servers.delete(server.key);
  }

  async sweep() {
    let changed = false;
    for (const s of [...this.servers.values()]) {
      if (!s.alive) continue;
      if (!(await probe(s.port))) {
        this.servers.delete(s.key);
        changed = true;
      }
    }
    if (changed) this.emit('change', this.list());
  }

  removePane(paneId) {
    this.recent.delete(paneId);
    let changed = false;
    for (const k of [...this.servers.keys()]) if (k.startsWith(paneId + ':')) changed = this.servers.delete(k) || changed;
    if (changed) this.emit('change', this.list());
  }

  list() {
    return [...this.servers.values()].filter((s) => s.alive);
  }
}

module.exports = { DevServers };
