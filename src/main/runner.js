// Detects runnable project commands: package scripts, Makefile/justfile targets, and common toolchains.
const fs = require('node:fs');
const path = require('node:path');
const git = require('./git');
const { readJSON, run } = require('./util');

const exists = (dir, f) => fs.existsSync(path.join(dir, f));

function packageManager(dir) {
  if (exists(dir, 'pnpm-lock.yaml')) return 'pnpm';
  if (exists(dir, 'yarn.lock')) return 'yarn';
  if (exists(dir, 'bun.lockb') || exists(dir, 'bun.lock')) return 'bun';
  return 'npm';
}

function makeTargets(file) {
  const text = fs.readFileSync(file, 'utf8');
  const targets = new Set();
  for (const m of text.matchAll(/^([A-Za-z0-9][A-Za-z0-9_.\-/]*)\s*:(?![:=])/gm)) {
    if (!m[1].includes('%') && !m[1].startsWith('.')) targets.add(m[1]);
  }
  return [...targets];
}

async function detect(cwd) {
  const top = (await git.root(cwd)) || cwd;
  const dirs = [...new Set([cwd, top])].filter((d) => d && fs.existsSync(d));
  const groups = [];
  for (const dir of dirs) {
    const rel = path.relative(top, dir) || path.basename(dir);
    if (exists(dir, 'package.json')) {
      const pkg = readJSON(path.join(dir, 'package.json'), {});
      const pm = packageManager(dir);
      const cmd = (s) => (pm === 'npm' ? `npm run ${s}` : pm === 'bun' ? `bun run ${s}` : `${pm} ${s}`);
      const items = Object.entries(pkg.scripts || {}).map(([name, script]) => ({ name, command: cmd(name), detail: script }));
      items.unshift({ name: 'install', command: `${pm} install`, detail: `${pm} install` });
      groups.push({ source: `${pm} · ${rel}`, kind: 'npm', dir, items });
    }
    if (exists(dir, 'deno.json')) {
      const d = readJSON(path.join(dir, 'deno.json'), {});
      const items = Object.keys(d.tasks || {}).map((t) => ({ name: t, command: `deno task ${t}`, detail: d.tasks[t] }));
      if (items.length) groups.push({ source: `deno · ${rel}`, kind: 'deno', dir, items });
    }
    for (const mk of ['Makefile', 'makefile', 'GNUmakefile']) {
      if (exists(dir, mk)) {
        const items = makeTargets(path.join(dir, mk)).map((t) => ({ name: t, command: `make ${t}`, detail: `make ${t}` }));
        if (items.length) groups.push({ source: `make · ${rel}`, kind: 'make', dir, items });
        break;
      }
    }
    if (exists(dir, 'justfile') || exists(dir, 'Justfile')) {
      const r = await run('just', ['--summary'], { cwd: dir, timeout: 4000 });
      let names = r.ok ? r.stdout.trim().split(/\s+/).filter(Boolean) : [];
      if (!names.length) names = makeTargets(path.join(dir, exists(dir, 'justfile') ? 'justfile' : 'Justfile'));
      if (names.length) groups.push({ source: `just · ${rel}`, kind: 'just', dir, items: names.map((n) => ({ name: n, command: `just ${n}`, detail: `just ${n}` })) });
    }
    if (exists(dir, 'Cargo.toml')) {
      groups.push({ source: `cargo · ${rel}`, kind: 'cargo', dir, items: ['run', 'build', 'test', 'check', 'clippy'].map((n) => ({ name: n, command: `cargo ${n}`, detail: `cargo ${n}` })) });
    }
    if (exists(dir, 'go.mod')) {
      groups.push({ source: `go · ${rel}`, kind: 'go', dir, items: [['run', 'go run .'], ['build', 'go build ./...'], ['test', 'go test ./...'], ['vet', 'go vet ./...']].map(([n, c]) => ({ name: n, command: c, detail: c })) });
    }
    if (exists(dir, 'pyproject.toml') || exists(dir, 'requirements.txt')) {
      const uv = exists(dir, 'uv.lock');
      const poetry = exists(dir, 'poetry.lock');
      const pre = uv ? 'uv run ' : poetry ? 'poetry run ' : '';
      const items = [];
      if (uv) items.push({ name: 'sync', command: 'uv sync', detail: 'uv sync' });
      else if (poetry) items.push({ name: 'install', command: 'poetry install', detail: 'poetry install' });
      else if (exists(dir, 'requirements.txt')) items.push({ name: 'install', command: 'pip install -r requirements.txt', detail: 'pip install -r requirements.txt' });
      items.push({ name: 'test', command: `${pre}pytest`, detail: `${pre}pytest` });
      if (exists(dir, 'manage.py')) items.push({ name: 'runserver', command: `${pre}python manage.py runserver`, detail: 'Django dev server' });
      if (exists(dir, 'main.py')) items.push({ name: 'main', command: `${pre}python main.py`, detail: 'python main.py' });
      groups.push({ source: `python · ${rel}`, kind: 'python', dir, items });
    }
    for (const f of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
      if (exists(dir, f)) {
        groups.push({ source: `docker · ${rel}`, kind: 'docker', dir, items: [['up', 'docker compose up'], ['up -d', 'docker compose up -d'], ['down', 'docker compose down'], ['logs', 'docker compose logs -f']].map(([n, c]) => ({ name: n, command: c, detail: c })) });
        break;
      }
    }
  }
  return { root: top, groups };
}

module.exports = { detect };
