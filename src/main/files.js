const fs = require('node:fs');
const path = require('node:path');
const git = require('./git');
const { run } = require('./util');

const HIDDEN = new Set(['.git', '.DS_Store']);
const HEAVY = new Set(['node_modules', '.git', 'dist', 'build', '.next', '.nuxt', 'target', '.venv', 'venv', '__pycache__', '.cache', 'coverage', '.turbo']);

function listDir(dir, showHidden = false) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return { error: e.message, entries: [] };
  }
  const out = [];
  for (const e of entries) {
    if (HIDDEN.has(e.name)) continue;
    if (!showHidden && e.name.startsWith('.') && e.name !== '.env' && e.name !== '.github') continue;
    let isDir = e.isDirectory();
    if (e.isSymbolicLink()) {
      try {
        isDir = fs.statSync(path.join(dir, e.name)).isDirectory();
      } catch {}
    }
    out.push({ name: e.name, path: path.join(dir, e.name), isDir });
  }
  out.sort((a, b) => (a.isDir === b.isDir ? a.name.localeCompare(b.name, undefined, { numeric: true }) : a.isDir ? -1 : 1));
  return { entries: out };
}

// All project files for the @-mention picker: git's view when available, otherwise a bounded walk.
async function projectFiles(cwd, limit = 20000) {
  const top = await git.root(cwd);
  const base = top || cwd;
  if (top) {
    const r = await run('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: top });
    if (r.ok) return { root: base, files: r.stdout.split('\n').filter(Boolean).slice(0, limit) };
  }
  const files = [];
  const walk = (dir, depth) => {
    if (files.length >= limit || depth > 8) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (HEAVY.has(e.name) || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, depth + 1);
      else files.push(path.relative(base, p));
      if (files.length >= limit) return;
    }
  };
  walk(base, 0);
  return { root: base, files };
}

function readFile(file, maxBytes = 512 * 1024) {
  const st = fs.statSync(file);
  if (st.isDirectory()) throw new Error(`${file} is a directory`);
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(Math.min(st.size, maxBytes));
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  return { content: buf.toString('utf8'), truncated: st.size > maxBytes, size: st.size };
}

module.exports = { listDir, projectFiles, readFile };
