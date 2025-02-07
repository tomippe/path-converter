const { contextBridge, ipcRenderer } = require('electron');

// APIの公開
contextBridge.exposeInMainWorld(
    'electronAPI',
    {
        selectFile: () => ipcRenderer.invoke('select-file'),
        selectBasePath: () => ipcRenderer.invoke('select-base-path'),
        handlePath: (filePath, basePath) => ipcRenderer.invoke('handle-path', filePath, basePath),
        onSetDefaultBasePath: (callback) => ipcRenderer.on('set-default-base-path', (event, value) => callback(value)),
        writeToClipboard: (text) => ipcRenderer.invoke('write-to-clipboard', text),
        getFileInfo: (filePath) => ipcRenderer.invoke('get-file-info', filePath)
    }
); 