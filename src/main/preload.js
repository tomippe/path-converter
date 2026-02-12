const { contextBridge, ipcRenderer } = require('electron');

console.log('[DEBUG] Preload script starting...');

process.on('uncaughtException', (error) => {
    console.error('[DEBUG] Preload uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[DEBUG] Preload unhandled rejection:', reason);
});

const listeners = new Set();

try {
    console.log('[DEBUG] Setting up context bridge...');
    
    contextBridge.exposeInMainWorld('electronAPI', {
        selectFile: () => ipcRenderer.invoke('select-file'),
        selectBasePath: () => ipcRenderer.invoke('select-base-path'),
        handlePath: (filePath, basePath) => ipcRenderer.invoke('handle-path', filePath, basePath),
        onSetDefaultBasePath: (callback) => {
            console.log('[DEBUG] Registering default base path handler');
            const listener = (event, value) => {
                console.log('[DEBUG] Received default base path:', value);
                callback(value);
            };
            ipcRenderer.on('set-default-base-path', listener);
            listeners.add(() => {
                ipcRenderer.removeListener('set-default-base-path', listener);
            });
        },
        onHandleDroppedFile: (callback) => {
            console.log('[DEBUG] Registering dropped file handler');
            const listener = (event, filePath) => {
                console.log('[DEBUG] Received dropped file:', filePath);
                callback(filePath);
            };
            ipcRenderer.on('handle-dropped-file', listener);
            listeners.add(() => {
                ipcRenderer.removeListener('handle-dropped-file', listener);
            });
        },
        writeToClipboard: (text) => ipcRenderer.invoke('write-to-clipboard', text),
        readFromClipboard: () => ipcRenderer.invoke('read-from-clipboard'),
        getSystemLocale: () => ipcRenderer.invoke('get-system-locale'),
        getFileInfo: (filePath) => ipcRenderer.invoke('get-file-info', filePath)
    });

    console.log('[DEBUG] Context bridge setup complete');
} catch (error) {
    console.error('[DEBUG] Error in preload script:', error);
}

window.addEventListener('unload', () => {
    console.log('[DEBUG] Cleaning up listeners');
    listeners.forEach(cleanup => cleanup());
    listeners.clear();
}); 