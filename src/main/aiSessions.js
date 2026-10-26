// Finds recent Claude Code / Codex CLI / Gemini CLI sessions for a directory and
// builds the command that resumes them.
const fs = require('node:fs');
const path = require('node:path');
const { HOME } = require('./util');

const claudeDir = (cwd) => path.join(HOME, '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));

function newestFiles(dir, filter, limit = 20) {
  try {
    return fs
      .readdirSync(dir)
      .filter(filter)
      .map((f) => {
        const p = path.join(dir, f);
        return { path: p, mtime: fs.statSync(p).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, limit);
  } catch {
    return [];
  }
}

function firstUserText(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    for (const line of buf.toString('utf8', 0, n).split('\n')) {
      try {
        const o = JSON.parse(line);
        const msg = o.message || o.payload;
        if (o.type === 'user' && msg?.role === 'user') {
          const c = msg.content;
          const t = typeof c === 'string' ? c : Array.isArray(c) ? c.find((x) => x.type === 'text')?.text : '';
          if (t && !t.startsWith('<')) return t.slice(0, 120);
        }
      } catch {}
    }
  } catch {}
  return '';
}

function claudeSessions(cwd) {
  return newestFiles(claudeDir(cwd), (f) => f.endsWith('.jsonl'), 10).map((f) => {
    const id = path.basename(f.path, '.jsonl');
    return { tool: 'claude', name: 'Claude Code', id, cwd, mtime: f.mtime, title: firstUserText(f.path), resume: `claude --resume ${id}` };
  });
}

function codexSessions(cwd) {
  const out = [];
  const base = path.join(HOME, '.codex', 'sessions');
  // Walk newest day folders first (YYYY/MM/DD).
  const sorted = (d) => {
    try {
      return fs.readdirSync(d).sort().reverse();
    } catch {
      return [];
    }
  };
  let scanned = 0;
  outer: for (const y of sorted(base)) {
    for (const m of sorted(path.join(base, y))) {
      for (const d of sorted(path.join(base, y, m))) {
        for (const f of newestFiles(path.join(base, y, m, d), (x) => x.endsWith('.jsonl'), 50)) {
          if (++scanned > 200) break outer;
          try {
            const fd = fs.openSync(f.path, 'r');
            const buf = Buffer.alloc(8192);
            const n = fs.readSync(fd, buf, 0, buf.length, 0);
            fs.closeSync(fd);
            const meta = JSON.parse(buf.toString('utf8', 0, n).split('\n')[0]);
            const p = meta.payload || {};
            if (p.cwd === cwd && p.id) {
              out.push({ tool: 'codex', name: 'Codex CLI', id: p.id, cwd, mtime: f.mtime, title: '', resume: `codex resume ${p.id}` });
              if (out.length >= 5) break outer;
            }
          } catch {}
        }
      }
    }
  }
  return out;
}

function geminiSessions(cwd) {
  const projects = (() => {
    try {
      return JSON.parse(fs.readFileSync(path.join(HOME, '.gemini', 'projects.json'), 'utf8')).projects || {};
    } catch {
      return {};
    }
  })();
  const slug = projects[cwd];
  if (!slug) return [];
  const chats = newestFiles(path.join(HOME, '.gemini', 'tmp', slug, 'chats'), (f) => f.endsWith('.json'), 1);
  return chats.map((f) => ({ tool: 'gemini', name: 'Gemini CLI', id: path.basename(f.path, '.json'), cwd, mtime: f.mtime, title: '', resume: 'gemini --resume latest' }));
}

function forCwd(cwd) {
  if (!cwd) return [];
  return [...claudeSessions(cwd), ...codexSessions(cwd), ...geminiSessions(cwd)].sort((a, b) => b.mtime - a.mtime);
}

// Command to resume a session the app saw running when it was interrupted.
function resumeCommand(ai) {
  if (ai.tool === 'claude') {
    const s = claudeSessions(ai.cwd).find((x) => x.mtime >= (ai.startedAt || 0) - 60000);
    return s ? s.resume : 'claude --continue';
  }
  if (ai.tool === 'codex') return 'codex resume --last';
  if (ai.tool === 'gemini') return 'gemini --resume latest';
  return null;
}

module.exports = { forCwd, resumeCommand };
