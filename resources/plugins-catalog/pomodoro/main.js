const FOCUS = 25 * 60;
const BREAK = 5 * 60;
let mode = 'focus';
let left = FOCUS;
let running = false;
let done = (await termc.storage.get('completed')) || 0;

const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
function render() {
  const icon = mode === 'focus' ? '🍅' : '☕';
  termc.statusBar.set('timer', {
    text: `${icon} ${fmt(left)}${running ? '' : ' ⏸'}`,
    tooltip: `${mode === 'focus' ? 'Focus' : 'Break'} · ${done} pomodoros today · click to ${running ? 'pause' : 'start'}`,
    command: 'toggle',
  });
}

setInterval(async () => {
  if (!running) return;
  left -= 1;
  if (left <= 0) {
    if (mode === 'focus') {
      done += 1;
      await termc.storage.set('completed', done);
      termc.notifications.show('Focus session done — take a 5 minute break.', { title: 'Pomodoro', system: true });
      mode = 'break';
      left = BREAK;
    } else {
      termc.notifications.show('Break over — back to it.', { title: 'Pomodoro', system: true });
      mode = 'focus';
      left = FOCUS;
      running = false;
    }
  }
  render();
}, 1000);

termc.commands.register('toggle', 'Pomodoro: Start / Pause', () => { running = !running; render(); });
termc.commands.register('reset', 'Pomodoro: Reset', () => { running = false; mode = 'focus'; left = FOCUS; render(); });
termc.commands.register('break', 'Pomodoro: Start Break', () => { mode = 'break'; left = BREAK; running = true; render(); });
render();
