const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (fn) => {
  const h = (_e, ...args) => fn(...args);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

// Electron wraps errors as "Error invoking remote method 'x': Error: msg"; surface just the message.
const call = (channel, ...args) =>
  ipcRenderer.invoke(channel, ...args).catch((e) => {
    throw new Error(String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  });

const invoke =
  (channel) =>
  (...args) =>
    call(channel, ...args);

contextBridge.exposeInMainWorld('termc', {
  invoke: call,
  log: (...parts) => ipcRenderer.send('app:log', ...parts.map(String)),
  pty: {
    create: invoke('pty:create'),
    write: (id, data) => ipcRenderer.send('pty:write', id, data),
    resize: (id, cols, rows) => ipcRenderer.send('pty:resize', id, cols, rows),
    kill: invoke('pty:kill'),
    info: invoke('pty:info'),
    read: invoke('pty:read'),
    runAndWait: invoke('pty:runAndWait'),
    waitFor: invoke('pty:waitFor'),
    onData: on('pty:data'),
    onExit: on('pty:exit'),
    onCwd: on('pty:cwd'),
    onCommand: on('pty:command'),
    onProcess: on('pty:process'),
  },
  setActivePane: (info) => ipcRenderer.send('pane:active', info),
  controlRespond: (id, result, error) => ipcRenderer.send('control:response', id, result, error),
  on: {
    devservers: on('devservers'),
    screenshot: on('screenshot:captured'),
    control: on('control:request'),
    beforeQuit: on('app:before-quit'),
    menu: on('menu'),
    previewKey: on('preview:key'),
    spotify: on('spotify:state'),
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
});
