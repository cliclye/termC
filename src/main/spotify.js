// Spotify integration: drives the Spotify desktop app through its scripting interface
// (JavaScript for Automation via osascript). No account, API key or login needed.
// Playback changes are pushed by Spotify as a distributed notification, so the UI updates
// instantly without fast polling.
const { execFile } = require('node:child_process');
const { systemPreferences, shell } = require('electron');

// One script handles every action so each call is a single osascript process.
// `Application('Spotify')` throws (instead of prompting "Where is Spotify?") when it isn't installed,
// and `.running()` checks without launching it.
const SCRIPT = `
function run(argv) {
  const [action, arg] = argv;
  let sp;
  try { sp = Application('Spotify'); } catch (e) { return JSON.stringify({ installed: false }); }
  if (!sp.running()) {
    if (action !== 'state') return JSON.stringify({ installed: true, running: false, error: 'Spotify is not running' });
    return JSON.stringify({ installed: true, running: false });
  }
  switch (action) {
    case 'toggle': sp.playpause(); break;
    case 'play': sp.play(); break;
    case 'pause': sp.pause(); break;
    case 'next': sp.nextTrack(); break;
    case 'previous': sp.previousTrack(); break;
    case 'volume': sp.soundVolume = Math.max(0, Math.min(100, Math.round(Number(arg)))); break;
    case 'seek': sp.playerPosition = Math.max(0, Number(arg)); break;
    case 'shuffle': sp.shuffling = arg === 'true'; break;
    case 'repeat': sp.repeating = arg === 'true'; break;
    case 'playUri': sp.playTrack(arg); break;
  }
  const out = { installed: true, running: true, state: sp.playerState(), position: sp.playerPosition(), volume: sp.soundVolume(), shuffling: sp.shuffling(), repeating: sp.repeating(), track: null };
  try {
    const c = sp.currentTrack;
    const id = c.id();
    if (id) out.track = { name: c.name(), artist: c.artist(), album: c.album(), duration: c.duration() / 1000, id, artwork: c.artworkUrl() || null, url: c.spotifyUrl() };
  } catch (e) {}
  return JSON.stringify(out);
}`;

const ACTIONS = new Set(['state', 'toggle', 'play', 'pause', 'next', 'previous', 'volume', 'seek', 'shuffle', 'repeat', 'playUri']);

let queue = Promise.resolve();
let last = null;
const listeners = new Set();

function osa(args) {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-l', 'JavaScript', '-e', SCRIPT, ...args], { timeout: 8000 }, (err, stdout, stderr) => {
      if (err) {
        const msg = String(stderr || err.message);
        // -1743: the user denied (or hasn't granted) TermC permission to control Spotify.
        if (/-1743|not authori[sz]ed/i.test(msg)) return reject(new Error('TermC needs permission to control Spotify. Allow it in System Settings → Privacy & Security → Automation → TermC.'));
        return reject(new Error(msg.trim().replace(/^.*execution error: /, '').replace(/ \(-?\d+\)$/, '') || 'Spotify did not respond'));
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error('Unexpected response from Spotify'));
      }
    });
  });
}

// Calls run one at a time so rapid clicks (next, next, next) apply in order.
function call(action, arg) {
  if (!ACTIONS.has(action)) return Promise.reject(new Error(`Unknown Spotify action ${action}`));
  if (process.platform !== 'darwin') return Promise.resolve({ installed: false, unsupported: true });
  const run = queue.then(() => osa(arg === undefined ? [action] : [action, String(arg)]));
  queue = run.catch(() => {});
  return run.then((s) => {
    if (s.error) throw new Error(s.error);
    if (action !== 'state') return settle(s);
    publish(s);
    return s;
  });
}

// Spotify applies some changes (next track, play by URI) a moment after the command returns.
async function settle(s) {
  publish(s);
  await new Promise((r) => setTimeout(r, 350));
  return state();
}

function publish(s) {
  s.at = Date.now();
  last = s;
  for (const fn of listeners) fn(s);
}

const state = () => call('state');

// Accepts open.spotify.com links (with or without ?si=… and intl-xx/ prefixes) and spotify: URIs.
function toUri(input) {
  const s = String(input || '').trim();
  if (/^spotify:(track|album|playlist|artist|show|episode):[A-Za-z0-9]+$/.test(s)) return s;
  if (/^spotify:user:[^:]+:playlist:[A-Za-z0-9]+$/.test(s)) return s.replace(/^spotify:user:[^:]+:/, 'spotify:');
  const m = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|artist|show|episode)\/([A-Za-z0-9]+)/);
  return m ? `spotify:${m[1]}:${m[2]}` : null;
}

async function playUri(input) {
  const uri = toUri(input);
  if (!uri) throw new Error('That is not a Spotify link. Paste a link like https://open.spotify.com/playlist/…');
  return call('playUri', uri);
}

// Opens Spotify in the background so the user stays in TermC.
function launch() {
  return new Promise((resolve) => {
    execFile('open', ['-g', '-b', 'com.spotify.client'], async (err) => {
      if (err) {
        shell.openExternal('https://www.spotify.com/download/mac/');
        return resolve({ installed: false });
      }
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const s = await state().catch(() => null);
        if (s?.running) return resolve(s);
      }
      resolve(await state().catch(() => ({ installed: true, running: false })));
    });
  });
}

let subscribed = false;
function watch(onChange) {
  listeners.add(onChange);
  if (subscribed || process.platform !== 'darwin') return;
  subscribed = true;
  try {
    systemPreferences.subscribeNotification('com.spotify.client.PlaybackStateChanged', () => {
      state().catch(() => {});
    });
  } catch {}
}

module.exports = { call, state, playUri, toUri, launch, watch, last: () => last };
