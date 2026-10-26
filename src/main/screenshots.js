// Region screenshots saved per project, so they can be pasted into Claude Code as images.
const fs = require('node:fs');
const path = require('node:path');
const git = require('./git');
const { TERMC_HOME, run } = require('./util');

const DIR = path.join(TERMC_HOME, 'screenshots');

async function projectName(cwd) {
  const top = cwd && (await git.root(cwd));
  const name = path.basename(top || cwd || 'general') || 'general';
  return name.replace(/[^\w.-]+/g, '-');
}

async function capture(cwd) {
  const project = await projectName(cwd);
  const dir = path.join(DIR, project);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19);
  const file = path.join(dir, `screenshot-${stamp}.png`);
  // -i: interactive region/window selection (Space toggles window mode), -x: no sound.
  await run('screencapture', ['-i', '-x', file], { timeout: 300000 });
  if (!fs.existsSync(file)) return null; // cancelled with Esc
  return { file, project };
}

function list() {
  const out = [];
  for (const project of fs.readdirSync(DIR)) {
    const dir = path.join(DIR, project);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/\.(png|jpe?g)$/i.test(f)) continue;
      const p = path.join(dir, f);
      out.push({ project, file: p, name: f, mtime: fs.statSync(p).mtimeMs });
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

function remove(file) {
  if (!path.resolve(file).startsWith(DIR + path.sep)) throw new Error('Not a TermC screenshot');
  fs.rmSync(file, { force: true });
}

module.exports = { capture, list, remove, DIR };
