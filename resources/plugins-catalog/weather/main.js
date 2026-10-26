async function update() {
  const city = (await termc.storage.get('city')) || '';
  try {
    const r = await termc.http.fetch(`https://wttr.in/${encodeURIComponent(city)}?format=%c%t`, { headers: { 'user-agent': 'curl' } });
    if (r.ok) termc.statusBar.set('now', { text: r.body.trim().replace(/\s+/g, ' '), tooltip: `Weather${city ? ' in ' + city : ''} · click to change city`, command: 'city' });
  } catch {}
}
termc.commands.register('city', 'Weather: Set City…', async () => {
  const city = await termc.ui.prompt('City for weather', { value: (await termc.storage.get('city')) || '' });
  if (city === null) return;
  await termc.storage.set('city', city.trim());
  update();
});
setInterval(update, 15 * 60 * 1000);
update();
