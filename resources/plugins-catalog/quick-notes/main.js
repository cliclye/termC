const html = `
<style>
  body { display: flex; flex-direction: column; height: 100vh; padding: 0 12px 12px; gap: 8px; }
  textarea { flex: 1; resize: none; width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 10px; font: 12.5px/1.5 "SF Mono", Menlo, monospace; outline: none; }
  textarea:focus { border-color: var(--accent); }
  .row { display: flex; justify-content: space-between; align-items: center; color: var(--muted); font-size: 11px; }
  button { background: var(--elevated); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 4px 10px; font: inherit; }
</style>
<textarea id="t" placeholder="Notes, TODOs, commands to remember…"></textarea>
<div class="row"><span id="s">Saved</span><button id="send">Send line to terminal</button></div>
<script>
  const t = document.getElementById('t'), s = document.getElementById('s');
  let timer;
  t.addEventListener('input', () => { s.textContent = 'Saving…'; clearTimeout(timer); timer = setTimeout(() => termc.postMessage({ type: 'save', text: t.value }), 300); });
  document.getElementById('send').onclick = () => {
    const before = t.value.slice(0, t.selectionStart);
    const line = t.value.split('\\n')[before.split('\\n').length - 1];
    termc.postMessage({ type: 'send', text: line });
  };
  termc.onMessage((m) => { if (m.type === 'load') t.value = m.text; if (m.type === 'saved') s.textContent = 'Saved'; });
  termc.postMessage({ type: 'ready' });
</script>`;

await termc.panels.register('notes', { title: 'Quick Notes', icon: 'file', html });
termc.panels.onMessage('notes', async (m) => {
  if (m.type === 'ready') termc.panels.postMessage('notes', { type: 'load', text: (await termc.storage.get('text')) || '' });
  if (m.type === 'save') {
    await termc.storage.set('text', m.text);
    termc.panels.postMessage('notes', { type: 'saved' });
  }
  if (m.type === 'send' && m.text.trim()) termc.terminal.paste(m.text.trim());
});
termc.contextMenu.register('append', 'Add Selection to Quick Notes', async (ctx) => {
  if (!ctx.selection) return termc.notifications.show('Select some text first');
  const text = ((await termc.storage.get('text')) || '') + '\n' + ctx.selection;
  await termc.storage.set('text', text);
  termc.panels.postMessage('notes', { type: 'load', text });
  termc.notifications.show('Added to Quick Notes', { kind: 'success' });
});
