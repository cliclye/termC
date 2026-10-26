// Plugin files on disk. Plugins run in renderer Web Workers; this module installs them
// from the bundled store catalog and serves privileged API calls they make.
const fs = require('node:fs');
const path = require('node:path');
const { TERMC_HOME, RESOURCES, readJSON, writeJSON, run } = require('./util');

const DIR = path.join(TERMC_HOME, 'plugins');
const CATALOG = path.join(RESOURCES, 'plugins-catalog');
const DATA = path.join(TERMC_HOME, 'plugin-data');
const ID_RE = /^[a-z0-9][a-z0-9-]*$/;

function readManifest(dir) {
  const m = readJSON(path.join(dir, 'manifest.json'), null);
  if (!m || !ID_RE.test(m.id || '')) return null;
  return { permissions: [], ...m };
}

function installed() {
  return fs
    .readdirSync(DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readManifest(path.join(DIR, d.name)))
    .filter(Boolean);
}

function catalog() {
  const have = new Map(installed().map((m) => [m.id, m.version]));
  return fs
    .readdirSync(CATALOG, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => readManifest(path.join(CATALOG, d.name)))
    .filter(Boolean)
    .map((m) => ({ ...m, installed: have.has(m.id), installedVersion: have.get(m.id) }));
}

function install(id) {
  if (!ID_RE.test(id)) throw new Error('Invalid plugin id');
  const src = path.join(CATALOG, id);
  if (!fs.existsSync(src)) throw new Error(`Plugin ${id} is not in the store`);
  fs.cpSync(src, path.join(DIR, id), { recursive: true, force: true });
  return readManifest(path.join(DIR, id));
}

function uninstall(id) {
  if (!ID_RE.test(id)) throw new Error('Invalid plugin id');
  fs.rmSync(path.join(DIR, id), { recursive: true, force: true });
  fs.rmSync(path.join(DATA, `${id}.json`), { force: true });
}

function source(id) {
  if (!ID_RE.test(id)) throw new Error('Invalid plugin id');
  const m = readManifest(path.join(DIR, id));
  return fs.readFileSync(path.join(DIR, id, m.main || 'main.js'), 'utf8');
}

// Privileged calls, gated by the permissions the manifest declares.
async function api(id, method, args) {
  const m = readManifest(path.join(DIR, id));
  if (!m) throw new Error('Unknown plugin');
  const need = (perm) => {
    if (!m.permissions.includes(perm)) throw new Error(`Plugin "${id}" lacks the "${perm}" permission`);
  };
  const dataFile = path.join(DATA, `${id}.json`);
  switch (method) {
    case 'storage.get':
      return readJSON(dataFile, {})[args.key];
    case 'storage.set': {
      const d = readJSON(dataFile, {});
      d[args.key] = args.value;
      writeJSON(dataFile, d);
      return true;
    }
    case 'storage.keys':
      return Object.keys(readJSON(dataFile, {}));
    case 'exec': {
      need('exec');
      const r = await run('/bin/sh', ['-c', args.command], { cwd: args.cwd, timeout: args.timeout || 30000 });
      return { code: r.code, stdout: r.stdout, stderr: r.stderr };
    }
    case 'fs.readFile':
      need('filesystem');
      return fs.readFileSync(args.path, 'utf8');
    case 'fs.writeFile':
      need('filesystem');
      fs.writeFileSync(args.path, args.content);
      return true;
    case 'fs.readDir':
      need('filesystem');
      return fs.readdirSync(args.path, { withFileTypes: true }).map((e) => ({ name: e.name, isDir: e.isDirectory() }));
    case 'fs.exists':
      need('filesystem');
      return fs.existsSync(args.path);
    case 'http.fetch': {
      need('http');
      const r = await fetch(args.url, { method: args.method || 'GET', headers: args.headers, body: args.body, signal: AbortSignal.timeout(20000) });
      return { status: r.status, ok: r.ok, headers: Object.fromEntries(r.headers), body: await r.text() };
    }
    default:
      throw new Error(`Unknown plugin API: ${method}`);
  }
}

module.exports = { installed, catalog, install, uninstall, source, api };
