termc.commands.register('kill', 'Ports: Stop Process on Port…', async () => {
  const r = await termc.exec("lsof -nP -iTCP -sTCP:LISTEN | awk 'NR>1 {print $1, $2, $9}' | sort -u -k3");
  const items = r.stdout.trim().split('\n').filter(Boolean).map((l) => {
    const [cmd, pid, addr] = l.split(' ');
    return { label: `:${addr.split(':').pop()}  ${cmd}`, detail: `pid ${pid}`, value: pid };
  });
  if (!items.length) return termc.notifications.show('No listening ports found');
  const pid = await termc.ui.pick(items, { title: 'Choose a listening port to stop' });
  if (!pid) return;
  const k = await termc.exec(`kill ${Number(pid)}`);
  termc.notifications.show(k.code === 0 ? `Stopped process ${pid}` : k.stderr || 'Could not stop process', { kind: k.code === 0 ? 'success' : 'error' });
});
