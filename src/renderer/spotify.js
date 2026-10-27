// Spotify player state for the renderer. Kept out of the main store so frequent playback
// updates don't trigger session saves.
import { useSyncExternalStore } from 'react';
import * as S from './store';

const api = window.termc;

let state = { status: null, error: null };
const listeners = new Set();
const set = (patch) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l) => (listeners.add(l), () => listeners.delete(l));
export const useSpotify = (sel = (s) => s) => useSyncExternalStore(subscribe, () => sel(state));
export const getSpotify = () => state;

const enabled = () => S.getState().settings?.spotify?.enabled !== false;

// Spotify pushes playback changes as notifications; polling only catches anything missed
// (and notices Spotify being opened or quit), so it can be slow.
let timer = null;
export function startSpotify() {
  api.on.spotify((status) => set({ status, error: null }));
  const tick = async () => {
    if (enabled() && !document.hidden) await refresh();
    const running = state.status?.running;
    timer = setTimeout(tick, running ? 5000 : 15000);
  };
  tick();
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && enabled()) refresh();
  });
}

export async function refresh() {
  try {
    set({ status: await api.invoke('spotify:state'), error: null });
  } catch (e) {
    set({ error: e.message });
  }
}

// Current playback position, extrapolated from the last report while playing.
export function positionOf(st, now = Date.now()) {
  if (!st?.track) return 0;
  const p = st.position + (st.state === 'playing' ? (now - (st.at || now)) / 1000 : 0);
  return Math.min(st.track.duration, Math.max(0, p));
}

async function act(action, arg, optimistic) {
  if (optimistic && state.status) set({ status: { ...state.status, ...optimistic, at: Date.now() } });
  try {
    set({ status: await api.invoke('spotify:call', action, arg), error: null });
  } catch (e) {
    set({ error: e.message });
    S.toast(e.message, { kind: 'error', title: 'Spotify' });
    refresh();
  }
}

export const togglePlay = () => act('toggle', undefined, state.status?.running && { state: state.status.state === 'playing' ? 'paused' : 'playing', position: positionOf(state.status) });
export const next = () => act('next');
export const previous = () => act('previous');
export const seek = (sec) => act('seek', sec, { position: sec });
export const setShuffle = (on) => act('shuffle', on, { shuffling: on });
export const setRepeat = (on) => act('repeat', on, { repeating: on });

// Volume sliders fire continuously; send at most one change per 120ms and always the last value.
let volTimer = null;
let volPending = null;
export function setVolume(v) {
  v = Math.max(0, Math.min(100, Math.round(v)));
  if (state.status) set({ status: { ...state.status, volume: v } });
  volPending = v;
  if (volTimer) return;
  volTimer = setTimeout(async () => {
    volTimer = null;
    await act('volume', volPending);
  }, 120);
}
export const nudgeVolume = (d) => setVolume((state.status?.volume ?? 50) + d);

export async function playUri(input, name) {
  try {
    const st = await api.invoke('spotify:playUri', input);
    set({ status: st, error: null });
    if (name) S.toast(`Playing ${name}`, { title: 'Spotify', timeout: 2500 });
    return st;
  } catch (e) {
    S.toast(e.message, { kind: 'error', title: 'Spotify' });
    throw e;
  }
}

export async function launch() {
  set({ launching: true });
  try {
    const st = await api.invoke('spotify:launch');
    set({ status: st, error: null });
    return st;
  } finally {
    set({ launching: false });
  }
}

// ---- saved playlists ----
export const favorites = () => S.getState().settings?.spotify?.favorites || [];
const saveFavorites = (list) => S.saveSettings({ spotify: { ...S.getState().settings.spotify, favorites: list } });

export function toUri(input) {
  const s = String(input || '').trim();
  if (/^spotify:(track|album|playlist|artist|show|episode):[A-Za-z0-9]+$/.test(s)) return s;
  const m = s.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(?:embed\/)?(track|album|playlist|artist|show|episode)\/([A-Za-z0-9]+)/);
  return m ? `spotify:${m[1]}:${m[2]}` : null;
}

export function addFavorite(name, input) {
  const uri = toUri(input);
  if (!uri) throw new Error('Paste a Spotify link, e.g. https://open.spotify.com/playlist/…');
  const entry = { name: name.trim() || defaultName(uri), uri };
  const list = favorites();
  // Saving something already in the list renames it where it is.
  return saveFavorites(list.some((f) => f.uri === uri) ? list.map((f) => (f.uri === uri ? entry : f)) : [...list, entry]);
}
export const renameFavorite = (uri, name) => saveFavorites(favorites().map((f) => (f.uri === uri ? { ...f, name: name.trim() || f.name } : f)));
export const removeFavorite = (uri) => saveFavorites(favorites().filter((f) => f.uri !== uri));
export function moveFavorite(uri, to) {
  const list = [...favorites()];
  const from = list.findIndex((f) => f.uri === uri);
  if (from < 0) return;
  const [f] = list.splice(from, 1);
  list.splice(to, 0, f);
  return saveFavorites(list);
}
const defaultName = (uri) => uri.split(':')[1].replace(/^./, (c) => c.toUpperCase());
export const kindOf = (uri) => uri.split(':')[1];

export const fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};
