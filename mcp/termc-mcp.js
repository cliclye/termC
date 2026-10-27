#!/usr/bin/env node
// TermC MCP server (stdio). Lets Claude Code, Cursor, Windsurf and other MCP clients
// control TermC terminals. It forwards each tool call to the running app over a
// local, token-protected HTTP endpoint described in ~/.termc/control.json.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const TOOLS = require('./tools');

const CONTROL = path.join(process.env.TERMC_HOME || path.join(os.homedir(), '.termc'), 'control.json');
const SERVER_INFO = { name: 'termc', version: '1.1.0' };

function callApp(method, params) {
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(CONTROL, 'utf8'));
  } catch {
    return Promise.reject(new Error('TermC is not running. Open the TermC app and try again.'));
  }
  const body = JSON.stringify({ method, params });
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: cfg.port, path: '/rpc', method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.token}`, 'content-length': Buffer.byteLength(body) } },
      (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            j.error ? reject(new Error(j.error)) : resolve(j.result);
          } catch {
            reject(new Error(`Bad response from TermC (${res.statusCode})`));
          }
        });
      },
    );
    req.on('error', () => reject(new Error('TermC is not running. Open the TermC app and try again.')));
    req.end(body);
  });
}

const write = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');

async function handle(msg) {
  const { id, method, params } = msg;
  if (id === undefined) return; // notification
  try {
    if (method === 'initialize') {
      return write({
        jsonrpc: '2.0',
        id,
        result: { protocolVersion: params?.protocolVersion || '2025-06-18', capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: 'Control TermC terminals, panes, tabs, workspaces, git, files, dev-server previews and Spotify playback. Omit paneId to target the focused pane.' },
      });
    }
    if (method === 'ping') return write({ jsonrpc: '2.0', id, result: {} });
    if (method === 'tools/list') return write({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    if (method === 'tools/call') {
      const { name, arguments: args } = params || {};
      if (!TOOLS.some((t) => t.name === name)) throw Object.assign(new Error(`Unknown tool ${name}`), { code: -32602 });
      try {
        const result = await callApp(name, args || {});
        const text = typeof result === 'string' ? result : JSON.stringify(result ?? { ok: true }, null, 2);
        return write({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text }] } });
      } catch (e) {
        return write({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: e.message }], isError: true } });
      }
    }
    if (method === 'resources/list') return write({ jsonrpc: '2.0', id, result: { resources: [] } });
    if (method === 'prompts/list') return write({ jsonrpc: '2.0', id, result: { prompts: [] } });
    write({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
  } catch (e) {
    write({ jsonrpc: '2.0', id, error: { code: e.code || -32603, message: e.message } });
  }
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try {
      handle(JSON.parse(line));
    } catch {
      write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    }
  }
});
