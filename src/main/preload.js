const { contextBridge, ipcRenderer, webUtils } = require('electron');

const on = (channel) => (fn) => {
  const h = (_e, ...args) => fn(...args);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

const invoke =
  (channel) =>
  (...args) =>
    ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('termc', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
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
  },
  pathForFile: (file) => webUtils.getPathForFile(file),
});
