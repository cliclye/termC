// Local-only HTTP endpoint the MCP bridge (mcp/termc-mcp.js) talks to.
// Port and a random token are written to ~/.termc/control.json (mode 600).
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { TERMC_HOME } = require('./util');

const FILE = path.join(TERMC_HOME, 'control.json');

function start(dispatch) {
  const token = crypto.randomBytes(24).toString('hex');
  const server = http.createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'POST' || req.url !== '/rpc') return send(404, { error: 'not found' });
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'unauthorized' });
    let body = '';
    req.on('data', (d) => {
      body += d;
      if (body.length > 5e6) req.destroy();
    });
    req.on('end', async () => {
      try {
        const { method, params } = JSON.parse(body);
        send(200, { result: await dispatch(method, params || {}) });
      } catch (e) {
        send(200, { error: e.message || String(e) });
      }
    });
  });
  server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    fs.writeFileSync(FILE, JSON.stringify({ port, token, pid: process.pid }), { mode: 0o600 });
  });
  return {
    server,
    info: () => ({ port: server.address()?.port, file: FILE }),
    stop: () => {
      server.close();
      try {
        const cur = JSON.parse(fs.readFileSync(FILE, 'utf8'));
        if (cur.pid === process.pid) fs.rmSync(FILE);
      } catch {}
    },
  };
}

module.exports = { start };
