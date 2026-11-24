const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadTasks: () => ipcRenderer.invoke('tasks:load'),
  saveTasks: (tasks) => ipcRenderer.invoke('tasks:save', tasks),
  pickFiles: (taskId) => ipcRenderer.invoke('files:pick', taskId),
  addPaths: (taskId, paths) => ipcRenderer.invoke('files:add-paths', taskId, paths),
  openFile: (taskId, id, name) => ipcRenderer.invoke('files:open', taskId, id, name),
  revealFile: (taskId, id, name) => ipcRenderer.invoke('files:reveal', taskId, id, name),
  removeFile: (taskId, id, name) => ipcRenderer.invoke('files:remove', taskId, id, name),
  removeTaskFiles: (taskId) => ipcRenderer.invoke('files:remove-task', taskId),
  openLink: (url) => ipcRenderer.invoke('link:open', url),
  pathForFile: (file) => webUtils.getPathForFile(file),
});
