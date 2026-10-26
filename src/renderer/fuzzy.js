// Subsequence fuzzy matching with bonuses for word starts, path segments and contiguity.
export function fuzzyScore(text, query) {
  if (!query) return { score: 0, positions: [] };
  const t = text.toLowerCase();
  const q = query.toLowerCase().replace(/\s+/g, '');
  const positions = [];
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of q) {
    const idx = t.indexOf(ch, ti);
    if (idx < 0) return null;
    const before = text[idx - 1];
    let s = 1;
    if (idx === prev + 1) s += 4;
    if (idx === 0 || before === '/' || before === ' ' || before === '-' || before === '_' || before === '.' || before === ':') s += 3;
    if (text[idx] !== t[idx]) s += 1;
    score += s;
    positions.push(idx);
    prev = idx;
    ti = idx + 1;
  }
  // Prefer matches in the file name and shorter strings.
  const slash = text.lastIndexOf('/');
  if (positions[0] > slash) score += 5;
  score -= text.length * 0.02;
  return { score, positions };
}

export function fuzzyFilter(items, query, key = (x) => x.title) {
  if (!query) return items.map((item) => ({ item, score: 0, positions: [] }));
  const out = [];
  for (const item of items) {
    const r = fuzzyScore(key(item), query);
    if (r) out.push({ item, ...r });
  }
  return out.sort((a, b) => b.score - a.score);
}
