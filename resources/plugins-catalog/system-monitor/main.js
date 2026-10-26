async function update() {
  const r = await termc.exec("sysctl -n vm.loadavg hw.ncpu; memory_pressure -Q 2>/dev/null | tail -1");
  const lines = r.stdout.trim().split('\n');
  const load = parseFloat((lines[0] || '').replace(/[{}]/g, '').trim().split(/\s+/)[0]);
  const cpus = parseInt(lines[1], 10) || 1;
  const free = (lines[2] || '').match(/(\d+)%/);
  const cpu = Math.min(100, Math.round((load / cpus) * 100));
  termc.statusBar.set('sys', {
    text: `CPU ${cpu}%${free ? ` · Mem ${100 - Number(free[1])}%` : ''}`,
    tooltip: `Load average ${load} on ${cpus} cores`,
    color: cpu > 85 ? '#f7768e' : undefined,
  });
}
setInterval(update, 4000);
update();
