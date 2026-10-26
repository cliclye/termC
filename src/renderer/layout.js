// Binary split tree helpers. Node: {type:'pane', id, cwd} | {type:'split', id, dir:'row'|'column', ratio, a, b}
export const rid = (p) => p + Math.random().toString(36).slice(2, 9);

export const newPane = (cwd, command) => ({ type: 'pane', id: rid('p'), cwd, ...(command ? { command } : {}) });

export function panesOf(node, out = []) {
  if (!node) return out;
  if (node.type === 'pane') out.push(node);
  else {
    panesOf(node.a, out);
    panesOf(node.b, out);
  }
  return out;
}

export function findPane(node, id) {
  return panesOf(node).find((p) => p.id === id);
}

export function mapTree(node, fn) {
  const n = fn(node);
  if (n !== node || node.type === 'pane') return n;
  const a = mapTree(node.a, fn);
  const b = mapTree(node.b, fn);
  return a === node.a && b === node.b ? node : { ...node, a, b };
}

// Replace pane `id` with a split of [pane, newNode] (or [newNode, pane] when `before`).
export function splitAt(root, id, dir, newNode, before = false) {
  return mapTree(root, (n) => (n.type === 'pane' && n.id === id ? { type: 'split', id: rid('s'), dir, ratio: 0.5, a: before ? newNode : n, b: before ? n : newNode } : n));
}

export function removePane(node, id) {
  if (!node) return null;
  if (node.type === 'pane') return node.id === id ? null : node;
  const a = removePane(node.a, id);
  const b = removePane(node.b, id);
  if (!a) return b;
  if (!b) return a;
  return a === node.a && b === node.b ? node : { ...node, a, b };
}

export function setRatio(node, splitId, ratio) {
  return mapTree(node, (n) => (n.type === 'split' && n.id === splitId ? { ...n, ratio: Math.min(0.9, Math.max(0.1, ratio)) } : n));
}

export function equalize(node) {
  return mapTree(node, (n) => (n.type === 'split' ? { ...n, ratio: 0.5 } : n));
}

export function parentSplit(node, id, parent = null) {
  if (!node) return null;
  if (node.type === 'pane') return node.id === id ? parent : null;
  return parentSplit(node.a, id, node) || parentSplit(node.b, id, node);
}

// Geometry of each pane in unit space; used for directional focus.
export function rects(node, x = 0, y = 0, w = 1, h = 1, out = {}) {
  if (node.type === 'pane') out[node.id] = { x, y, w, h };
  else if (node.dir === 'row') {
    rects(node.a, x, y, w * node.ratio, h, out);
    rects(node.b, x + w * node.ratio, y, w * (1 - node.ratio), h, out);
  } else {
    rects(node.a, x, y, w, h * node.ratio, out);
    rects(node.b, x, y + h * node.ratio, w, h * (1 - node.ratio), out);
  }
  return out;
}

export function neighbor(root, id, direction) {
  const r = rects(root);
  const cur = r[id];
  if (!cur) return null;
  const cx = cur.x + cur.w / 2;
  const cy = cur.y + cur.h / 2;
  let best = null;
  let bestD = Infinity;
  for (const [pid, p] of Object.entries(r)) {
    if (pid === id) continue;
    const px = p.x + p.w / 2;
    const py = p.y + p.h / 2;
    const ok =
      (direction === 'left' && p.x + p.w <= cur.x + 1e-6) ||
      (direction === 'right' && p.x >= cur.x + cur.w - 1e-6) ||
      (direction === 'up' && p.y + p.h <= cur.y + 1e-6) ||
      (direction === 'down' && p.y >= cur.y + cur.h - 1e-6);
    if (!ok) continue;
    const d = Math.hypot(px - cx, py - cy);
    if (d < bestD) {
      bestD = d;
      best = pid;
    }
  }
  return best;
}
