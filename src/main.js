const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const dataDir = () => app.getPath('userData');
const dataFile = () => path.join(dataDir(), 'tasks.json');
const attachDir = (taskId) => path.join(dataDir(), 'attachments', taskId);

// Only allow simple ids so renderer input can't escape the attachments dir.
const safeId = (s) => typeof s === 'string' && /^[\w-]+$/.test(s);

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 720,
    minHeight: 480,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#f5f5f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  // Never navigate the app window away from the local page.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

ipcMain.handle('tasks:load', () => {
  try {
    return JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
  } catch {
    return [];
  }
});

ipcMain.handle('tasks:save', (_e, tasks) => {
  fs.mkdirSync(dataDir(), { recursive: true });
  const tmp = dataFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(tasks, null, 2));
  fs.renameSync(tmp, dataFile()); // atomic replace
  return true;
});

function copyIn(taskId, srcPath) {
  const dir = attachDir(taskId);
  fs.mkdirSync(dir, { recursive: true });
  const id = crypto.randomUUID();
  const name = path.basename(srcPath);
  fs.copyFileSync(srcPath, path.join(dir, `${id}-${name}`));
  return { id, name };
}

ipcMain.handle('files:pick', async (e, taskId) => {
  if (!safeId(taskId)) return [];
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'] });
  if (res.canceled) return [];
  return res.filePaths.map((p) => copyIn(taskId, p));
});

ipcMain.handle('files:add-paths', (_e, taskId, paths) => {
  if (!safeId(taskId)) return [];
  return paths
    .filter((p) => typeof p === 'string' && fs.existsSync(p) && fs.statSync(p).isFile())
    .map((p) => copyIn(taskId, p));
});

function findStored(taskId, fileId, name) {
  if (!safeId(taskId) || !safeId(fileId)) return null;
  const p = path.join(attachDir(taskId), `${fileId}-${path.basename(name)}`);
  return fs.existsSync(p) ? p : null;
}

ipcMain.handle('files:open', async (_e, taskId, fileId, name) => {
  const p = findStored(taskId, fileId, name);
  if (p) await shell.openPath(p);
});

ipcMain.handle('files:reveal', (_e, taskId, fileId, name) => {
  const p = findStored(taskId, fileId, name);
  if (p) shell.showItemInFolder(p);
});

ipcMain.handle('files:remove', (_e, taskId, fileId, name) => {
  const p = findStored(taskId, fileId, name);
  if (p) fs.rmSync(p, { force: true });
});

ipcMain.handle('files:remove-task', (_e, taskId) => {
  if (safeId(taskId)) fs.rmSync(attachDir(taskId), { recursive: true, force: true });
});

ipcMain.handle('link:open', (_e, url) => {
  try {
    const u = new URL(url);
    if (['http:', 'https:', 'mailto:'].includes(u.protocol)) return shell.openExternal(u.href);
  } catch {}
});

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Standard macOS behaviour: keep running until Cmd+Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
