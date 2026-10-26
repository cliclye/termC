const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');

const HOME = os.homedir();
const TERMC_HOME = process.env.TERMC_HOME || path.join(HOME, '.termc');
// In a packaged app these files are unpacked next to app.asar so shells and node can read them.
const unpacked = (p) => p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const RESOURCES = unpacked(path.join(__dirname, '..', 'resources'));

for (const d of ['', 'buffers', 'plugins', 'plugin-data', 'screenshots']) {
  fs.mkdirSync(path.join(TERMC_HOME, d), { recursive: true });
}

function readJSON(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJSON(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function run(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { maxBuffer: 32 * 1024 * 1024, timeout: 30000, ...opts }, (err, stdout, stderr) => {
      resolve({ ok: !err, code: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout: String(stdout), stderr: String(stderr), error: err && err.message });
    });
  });
}

const stripAnsi = (s) =>
  s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '')
    .replace(/\x1b[()][A-Z0-9]/g, '')
    .replace(/\x1b[=>78DEHM]/g, '');

const uid = (p = '') => p + Math.random().toString(36).slice(2, 10);

module.exports = { HOME, TERMC_HOME, RESOURCES, unpacked, readJSON, writeJSON, run, stripAnsi, uid };
