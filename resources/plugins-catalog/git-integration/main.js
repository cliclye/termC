let cwd = null;

async function refresh() {
  const t = await termc.terminal.active();
  cwd = t && t.cwd;
  if (!cwd) return termc.statusBar.remove('branch');
  const r = await termc.exec('git rev-parse --abbrev-ref HEAD && git status --porcelain | wc -l', { cwd });
  if (r.code !== 0) return termc.statusBar.remove('branch');
  const [branch, count] = r.stdout.trim().split('\n').map((s) => s.trim());
  const dirty = Number(count) > 0;
  await termc.statusBar.set('branch', { text: `⎇ ${branch}${dirty ? ' ●' : ''}`, tooltip: `${count} changed files — click to copy branch`, command: 'copyBranch', color: dirty ? '#e5c07b' : undefined });
}

termc.commands.register('copyBranch', 'Git: Copy Current Branch Name', async () => {
  const r = await termc.exec('git rev-parse --abbrev-ref HEAD', { cwd });
  await termc.terminal.paste(r.stdout.trim());
  termc.notifications.show(`Inserted ${r.stdout.trim()}`);
});

termc.commands.register('openRemote', 'Git: Open Remote in Browser', async () => {
  const r = await termc.exec('git remote get-url origin', { cwd });
  let url = r.stdout.trim().replace(/^git@([^:]+):/, 'https://$1/').replace(/\.git$/, '');
  if (!url) return termc.notifications.show('No origin remote', { kind: 'error' });
  await termc.exec(`open ${JSON.stringify(url)}`);
});

termc.events.on('cwdChanged', refresh);
termc.events.on('commandFinished', refresh);
setInterval(refresh, 5000);
refresh();
