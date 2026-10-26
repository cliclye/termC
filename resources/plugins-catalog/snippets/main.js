termc.commands.register('uuid', 'Snippets: Insert UUID', () => termc.terminal.paste(crypto.randomUUID()));
termc.commands.register('timestamp', 'Snippets: Insert ISO Timestamp', () => termc.terminal.paste(new Date().toISOString()));
termc.commands.register('save', 'Snippets: Save New Snippet…', async () => {
  const text = await termc.ui.prompt('Snippet text', { placeholder: 'docker compose up -d --build' });
  if (!text) return;
  const list = (await termc.storage.get('list')) || [];
  await termc.storage.set('list', [...list, text]);
  termc.notifications.show('Snippet saved', { kind: 'success' });
});
termc.commands.register('insert', 'Snippets: Insert Saved Snippet…', async () => {
  const list = (await termc.storage.get('list')) || [];
  if (!list.length) return termc.notifications.show('No snippets yet — run "Snippets: Save New Snippet…"');
  const s = await termc.ui.pick(list, { title: 'Insert snippet' });
  if (s) termc.terminal.paste(s);
});
termc.keybindings.register('mod+alt+u', 'uuid');
termc.keybindings.register('mod+alt+i', 'insert');
termc.contextMenu.register('uuid', 'Insert UUID', () => termc.terminal.paste(crypto.randomUUID()));
termc.contextMenu.register('ts', 'Insert Timestamp', () => termc.terminal.paste(new Date().toISOString()));
