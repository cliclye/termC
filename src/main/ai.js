// Natural-language → shell command. Free by default: uses the locally installed
// Claude Code CLI or Ollama; API keys (Anthropic / OpenAI-compatible) are optional.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const settings = require('./settings');
const git = require('./git');
const { run } = require('./util');

async function which(bin) {
  const r = await run('/bin/sh', ['-c', `command -v ${bin}`], { timeout: 3000 });
  return r.ok ? r.stdout.trim() : null;
}

async function ollamaUp() {
  try {
    const r = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(800) });
    return r.ok ? (await r.json()).models?.map((m) => m.name) || [] : null;
  } catch {
    return null;
  }
}

async function providers() {
  const s = settings.load().ai;
  const [claude, models] = await Promise.all([which('claude'), ollamaUp()]);
  return {
    claudeCli: !!claude,
    ollama: !!models,
    ollamaModels: models || [],
    anthropic: !!s.anthropicKey,
    openai: !!s.openaiKey,
  };
}

async function buildContext(cwd, shell) {
  let files = [];
  try {
    files = fs.readdirSync(cwd).slice(0, 60);
  } catch {}
  const st = await git.status(cwd).catch(() => ({ repo: false }));
  return [
    `OS: macOS (${process.arch})`,
    `Shell: ${path.basename(shell || process.env.SHELL || 'zsh')}`,
    `Working directory: ${cwd}`,
    st.repo ? `Git branch: ${st.branch} (${st.files.length} changed files)` : 'Not a git repository',
    `Entries in cwd: ${files.join(', ') || '(empty)'}`,
  ].join('\n');
}

const SYSTEM =
  'You translate a request into ONE shell command for the user\'s terminal. ' +
  'Reply with JSON only: {"command": "<single command line>", "explanation": "<one short sentence>"}. ' +
  'Prefer safe, read-only commands when the request is ambiguous. Use the given shell syntax and macOS (BSD) tool flags. No markdown.';

function parse(text) {
  const t = String(text || '').trim();
  const json = t.match(/\{[\s\S]*\}/);
  if (json) {
    try {
      const o = JSON.parse(json[0]);
      if (o.command) return { command: String(o.command).trim(), explanation: String(o.explanation || '').trim() };
    } catch {}
  }
  const fenced = t.match(/```(?:\w+)?\n?([\s\S]*?)```/);
  const cmd = (fenced ? fenced[1] : t).trim().split('\n')[0].replace(/^\$\s*/, '');
  return { command: cmd, explanation: '' };
}

function claudeCli(prompt) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;
    const p = spawn('claude', ['-p', '--output-format', 'text', '--model', 'haiku', prompt], { env, cwd: os.tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    const t = setTimeout(() => (p.kill(), reject(new Error('Claude Code CLI timed out'))), 60000);
    p.on('error', (e) => (clearTimeout(t), reject(e)));
    p.on('close', (code) => {
      clearTimeout(t);
      code === 0 ? resolve(out) : reject(new Error(err.trim() || `claude exited with ${code}`));
    });
  });
}

async function anthropic(s, system, user) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': s.anthropicKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: s.anthropicModel, max_tokens: 400, system, messages: [{ role: 'user', content: user }] }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `Anthropic API error ${r.status}`);
  return j.content.map((c) => c.text || '').join('');
}

async function openai(s, system, user) {
  const r = await fetch(`${s.openaiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${s.openaiKey}` },
    body: JSON.stringify({ model: s.openaiModel, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0 }),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `API error ${r.status}`);
  return j.choices[0].message.content;
}

async function ollama(s, system, user, models) {
  const model = models.includes(s.ollamaModel) || models.some((m) => m.startsWith(s.ollamaModel + ':')) ? s.ollamaModel : models[0];
  if (!model) throw new Error('Ollama is running but has no models. Run: ollama pull llama3.2');
  const r = await fetch('http://127.0.0.1:11434/api/chat', {
    method: 'POST',
    body: JSON.stringify({ model, stream: false, format: 'json', messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    signal: AbortSignal.timeout(60000),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || `Ollama error ${r.status}`);
  return j.message.content;
}

async function generate({ query, cwd, shell }) {
  const s = settings.load().ai;
  const ctx = await buildContext(cwd, shell);
  const user = `${ctx}\n\nRequest: ${query}`;
  let provider = s.provider;
  if (provider === 'auto') {
    const p = await providers();
    provider = p.claudeCli ? 'claude-cli' : p.ollama && p.ollamaModels.length ? 'ollama' : p.anthropic ? 'anthropic' : p.openai ? 'openai' : null;
    if (!provider) throw new Error('No AI provider found. Install Claude Code or Ollama, or add an API key in Settings → AI.');
  }
  let text;
  if (provider === 'claude-cli') text = await claudeCli(`${SYSTEM}\n\n${user}`);
  else if (provider === 'anthropic') {
    if (!s.anthropicKey) throw new Error('Add an Anthropic API key in Settings → AI.');
    text = await anthropic(s, SYSTEM, user);
  } else if (provider === 'openai') {
    if (!s.openaiKey) throw new Error('Add an API key in Settings → AI.');
    text = await openai(s, SYSTEM, user);
  } else if (provider === 'ollama') {
    const models = await ollamaUp();
    if (!models) throw new Error('Ollama is not running. Start it with: ollama serve');
    text = await ollama(s, SYSTEM, user, models);
  }
  return { ...parse(text), provider };
}

module.exports = { generate, providers };
