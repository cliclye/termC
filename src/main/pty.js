// Owns every shell process. Parses the shell-integration escape sequences
// (cwd, command start/finish) and keeps a plain-text tail for reading/MCP.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const pty = require('node-pty');
const { TERMC_HOME, RESOURCES, run, stripAnsi } = require('./util');

const SHELL_DIR = path.join(RESOURCES, 'shell');
const MAX_TAIL = 256 * 1024;
const AI_TOOLS = [
  { id: 'claude', name: 'Claude Code', re: /(^|[\s/])claude(\s|$)/ },
  { id: 'codex', name: 'Codex CLI', re: /(^|[\s/])codex(\s|$)/ },
  { id: 'gemini', name: 'Gemini CLI', re: /(^|[\s/])gemini(\s|$)/ },
];

class PtyManager extends EventEmitter {
  constructor() {
    super();
    this.ptys = new Map();
    this.poll = setInterval(() => this.pollProcesses(), 1000);
  }

  create({ id, cwd, cols = 80, rows = 24, shell, command }) {
    if (this.ptys.has(id)) return this.info(id);
    // Fall back gracefully when a restored folder was deleted or the configured shell is wrong.
    if (!cwd || !isDir(cwd)) cwd = os.homedir();
    shell = [shell, process.env.SHELL, '/bin/zsh', '/bin/bash'].find((s) => s && isExecutable(s));
    const base = path.basename(shell);
    const env = { ...process.env };
    for (const k of ['ELECTRON_RUN_AS_NODE', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT', 'ZDOTDIR', 'TERM_PROGRAM_VERSION', 'NO_COLOR']) delete env[k];
    Object.assign(env, {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
      TERM_PROGRAM: 'TermC',
      TERMC_HOME,
      TERMC_SHELL_DIR: SHELL_DIR,
      TERMC_PANE_ID: id,
      LANG: process.env.LANG || 'en_US.UTF-8',
    });
    let args = [];
    if (base === 'zsh') {
      env.TERMC_USER_ZDOTDIR = process.env.ZDOTDIR || os.homedir();
      env.ZDOTDIR = path.join(SHELL_DIR, 'zsh');
      args = ['-l'];
    } else if (base === 'bash') {
      args = ['--rcfile', path.join(SHELL_DIR, 'termc.bash'), '-i'];
    } else if (base === 'fish') {
      args = ['-l', '--init-command', `source ${JSON.stringify(path.join(SHELL_DIR, 'termc.fish'))}`];
    } else {
      args = ['-l'];
    }
    const p = pty.spawn(shell, args, { name: 'xterm-256color', cols: Math.max(2, cols | 0), rows: Math.max(1, rows | 0), cwd, env });
    let markReady;
    const rec = {
      id,
      pty: p,
      cwd,
      // Resolves at the first prompt, so commands aren't typed into a shell that is still starting.
      ready: new Promise((r) => (markReady = r)),
      markReady: () => markReady(),
      awaiting: false,
      tail: '',
      osc: '',
      running: false,
      lastExit: null,
      process: base,
      shellBase: base,
      fgArgs: '',
      ai: null,
      pending: '',
      flushTimer: null,
      waiters: [],
      dataListeners: new Set(),
    };
    this.ptys.set(id, rec);
    p.onData((data) => this.onData(rec, data));
    p.onExit(({ exitCode }) => {
      clearTimeout(rec.flushTimer);
      if (rec.pending) this.emit('data', id, rec.pending);
      if (this.ptys.get(id) === rec) this.ptys.delete(id);
      rec.waiters.splice(0).forEach((w) => w(null));
      this.emit('exit', id, exitCode);
    });
    // Shells without our hooks never report a prompt; don't wait on them forever.
    setTimeout(() => rec.markReady(), 4000);
    if (command) rec.ready.then(() => this.ptys.get(id) === rec && p.write(command + '\r'));
    return this.info(id);
  }

  onData(rec, data) {
    // Shell integration sequences may be split across chunks; keep a short carry-over.
    const scan = rec.osc + data;
    const re = /\x1b\](133;[A-D](?:;[^\x07\x1b]*)?|1337;CurrentDir=[^\x07\x1b]*)(?:\x07|\x1b\\)/g;
    let m;
    let lastIndex = 0;
    while ((m = re.exec(scan))) {
      lastIndex = re.lastIndex;
      const body = m[1];
      if (body.startsWith('1337;CurrentDir=')) {
        const cwd = body.slice(16);
        if (cwd && cwd !== rec.cwd) {
          rec.cwd = cwd;
          this.emit('cwd', rec.id, cwd);
        }
      } else if (body.startsWith('133;A')) {
        rec.markReady();
      } else if (body.startsWith('133;C')) {
        rec.running = true;
        this.emit('command', rec.id, { state: 'running' });
      } else if (body.startsWith('133;D')) {
        const exit = Number(body.split(';')[2] || 0);
        if (rec.running) {
          rec.running = false;
          rec.lastExit = exit;
          this.emit('command', rec.id, { state: 'done', exitCode: exit });
        }
        // Shells without a "command started" hook (macOS bash 3.2) still finish commands we sent.
        if (rec.awaiting) {
          rec.awaiting = false;
          rec.waiters.splice(0).forEach((w) => w(exit));
        }
      }
    }
    const rest = scan.slice(lastIndex);
    const open = rest.lastIndexOf('\x1b]');
    rec.osc = open >= 0 && rest.length - open < 512 ? rest.slice(open) : '';

    rec.tail += data;
    if (rec.tail.length > MAX_TAIL) rec.tail = rec.tail.slice(-MAX_TAIL / 2);
    rec.dataListeners.forEach((fn) => fn(data));

    rec.pending += data;
    if (!rec.flushTimer) {
      rec.flushTimer = setTimeout(() => {
        rec.flushTimer = null;
        const out = rec.pending;
        rec.pending = '';
        this.emit('data', rec.id, out);
      }, 4);
    }
  }

  write(id, data) {
    const rec = this.ptys.get(id);
    if (rec) rec.pty.write(data);
    return !!rec;
  }

  resize(id, cols, rows) {
    const rec = this.ptys.get(id);
    if (rec && cols > 0 && rows > 0) {
      try {
        rec.pty.resize(cols, rows);
      } catch {}
    }
  }

  kill(id) {
    const rec = this.ptys.get(id);
    if (!rec) return;
    this.ptys.delete(id);
    try {
      rec.pty.kill();
    } catch {}
  }

  killAll() {
    for (const id of [...this.ptys.keys()]) this.kill(id);
  }

  info(id) {
    const r = this.ptys.get(id);
    if (!r) return null;
    return { id, pid: r.pty.pid, cwd: r.cwd, process: r.process, running: r.running, lastExit: r.lastExit, ai: r.ai };
  }

  list() {
    return [...this.ptys.keys()].map((id) => this.info(id));
  }

  read(id, lines = 100) {
    const r = this.ptys.get(id);
    if (!r) return null;
    const text = stripAnsi(r.tail).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    return text.split('\n').slice(-lines).join('\n');
  }

  // Run a command and wait for the shell to report completion (OSC 133;D).
  async runAndWait(id, command, timeoutMs = 30000) {
    const r = this.ptys.get(id);
    if (!r) throw new Error(`No terminal ${id}`);
    await Promise.race([r.ready, new Promise((res) => setTimeout(res, 5000))]);
    let out = '';
    const listener = (d) => (out += d);
    r.dataListeners.add(listener);
    return new Promise((resolve) => {
      let done = false;
      const finish = (exitCode, timedOut) => {
        if (done) return;
        done = true;
        r.dataListeners.delete(listener);
        // Output is exactly what the shell printed between "command started" and "command finished".
        const start = out.indexOf('\x1b]133;C');
        const end = out.lastIndexOf('\x1b]133;D');
        let raw = out;
        if (start >= 0) raw = raw.slice(raw.indexOf('\x07', start) + 1, end > start ? end : undefined);
        else if (end >= 0) raw = raw.slice(0, end); // no start marker (bash 3.2): stop before the next prompt
        let text = stripAnsi(raw).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (start < 0) {
          const lines = text.split('\n');
          if (lines.length && lines[0].includes(command.slice(0, 20))) lines.shift();
          text = lines.join('\n');
        }
        // zsh marks output that lacked a final newline with a lone "%" line.
        text = text.replace(/^\n+/, '').replace(/\n?%\s*$/, '').trimEnd();
        resolve({ exitCode, timedOut, output: text.length > 60000 ? text.slice(-60000) : text });
      };
      r.waiters.push((code) => setTimeout(() => finish(code, false), 30));
      setTimeout(() => finish(null, true), timeoutMs);
      r.awaiting = true;
      // Ctrl-U first so anything half-typed at the prompt doesn't get prepended.
      r.pty.write('\x15' + command + '\r');
    });
  }

  waitFor(id, pattern, timeoutMs = 30000) {
    const r = this.ptys.get(id);
    if (!r) return Promise.reject(new Error(`No terminal ${id}`));
    const re = new RegExp(pattern);
    let buf = '';
    return new Promise((resolve) => {
      let t = null;
      const listener = (d) => {
        buf = (buf + stripAnsi(d)).slice(-20000);
        const m = buf.match(re);
        if (m) {
          r.dataListeners.delete(listener);
          clearTimeout(t);
          resolve({ matched: true, match: m[0] });
        }
      };
      t = setTimeout(() => {
        r.dataListeners.delete(listener);
        resolve({ matched: false });
      }, timeoutMs);
      r.dataListeners.add(listener);
    });
  }

  async pollProcesses() {
    // `ps` can be slow under load; never let polls pile up.
    if (this.polling) return;
    this.polling = true;
    try {
      await this.pollOnce();
    } finally {
      this.polling = false;
    }
  }

  async pollOnce() {
    for (const r of [...this.ptys.values()]) {
      let name;
      try {
        name = r.pty.process;
      } catch {
        continue;
      }
      if (name === r.process) continue;
      r.process = name;
      let args = '';
      if (name !== r.shellBase) {
        const fg = await run('ps', ['-o', 'tpgid=', '-p', String(r.pty.pid)], { timeout: 2000 });
        const pgid = fg.stdout.trim();
        if (pgid && pgid !== '-1') args = (await run('ps', ['-o', 'args=', '-p', pgid], { timeout: 2000 })).stdout.trim();
      }
      r.fgArgs = args;
      const tool = AI_TOOLS.find((t) => t.re.test(args) || t.id === name);
      const prevAi = r.ai;
      r.ai = tool ? { tool: tool.id, name: tool.name, args, cwd: r.cwd, startedAt: prevAi?.tool === tool.id ? prevAi.startedAt : Date.now() } : null;
      this.emit('process', r.id, { process: name, args, ai: r.ai });
    }
  }

}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function isExecutable(p) {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

module.exports = { PtyManager, AI_TOOLS };
