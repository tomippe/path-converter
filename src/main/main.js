const { app, BrowserWindow, ipcMain, dialog, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let defaultBasePath;
let fileToOpen = null;

// 最優先でイベントを登録
app.on('open-file', (event, filePath) => {
    event.preventDefault();
    if (app.isReady() && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('handle-dropped-file', filePath);
    } else {
        fileToOpen = filePath;
    }
});

// Windowsでのファイルドラッグ処理
function handleWindowsFileArg(argv) {
    // Windows実行ファイルへのドラッグの場合、パスは2番目の引数
    const filePath = argv[1];
    if (filePath && !filePath.startsWith('--')) {
        if (app.isReady() && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('handle-dropped-file', filePath);
        } else {
            fileToOpen = filePath;
        }
        return true;
    }
    return false;
}

const WINDOW_CONFIG = {
    width: 900,
    height: 680,
    webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        enableRemoteModule: false,
        preload: null
    },
    autoHideMenuBar: true,
    resizable: false,
    backgroundColor: '#E5E5E5'
};

function getAppPath() {
    return app.isPackaged 
        ? path.join(process.resourcesPath, 'app', 'src')
        : path.join(__dirname, '..');
}

function handleDroppedFile(filePath, targetWindow) {
    if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('handle-dropped-file', filePath);
    }
}

function createWindow(filePathToOpen = null) {
    if (mainWindow) return;

    defaultBasePath = app.getPath('home');
    WINDOW_CONFIG.webPreferences.preload = path.join(getAppPath(), 'main', 'preload.js');

    mainWindow = new BrowserWindow({
        ...WINDOW_CONFIG,
        show: false,
        webPreferences: {
            ...WINDOW_CONFIG.webPreferences,
            preload: path.join(getAppPath(), 'main', 'preload.js')
        }
    });

    mainWindow.once('ready-to-show', () => mainWindow.show());

    // ファイルのドロップを許可
    mainWindow.webContents.on('will-navigate', (event, url) => {
        event.preventDefault();
        handleDroppedFile(decodeURI(url.replace('file://', '')), mainWindow);
    });

    mainWindow.webContents.session.on('will-download', (event, item) => {
        event.preventDefault();
        handleDroppedFile(item.getFilename(), mainWindow);
    });

    // エラーハンドリング
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
        console.error('Page failed to load:', { errorCode, errorDescription });
    });

    const indexPath = path.join(getAppPath(), 'renderer', 'index.html');
    if (!fs.existsSync(indexPath)) {
        console.error('index.html not found at path:', indexPath);
        return;
    }

    mainWindow.loadFile(indexPath);

    mainWindow.webContents.on('did-finish-load', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('set-default-base-path', defaultBasePath);
            if (filePathToOpen) {
                mainWindow.webContents.send('handle-dropped-file', filePathToOpen);
            }
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    // Windowsでのファイルドラッグ処理
    if (process.platform === 'win32') {
        handleWindowsFileArg(process.argv);
        
        // 2回目以降のファイルドラッグ用
        app.on('second-instance', (event, argv) => {
            if (handleWindowsFileArg(argv)) {
                if (mainWindow) {
                    if (mainWindow.isMinimized()) mainWindow.restore();
                    mainWindow.focus();
                }
            }
        });
    }
    // macOSでのファイルドラッグ処理（既存のコード）
    else if (process.argv.length > 2) {
        fileToOpen = process.argv[2];
    }
    
    createWindow(fileToOpen);
    fileToOpen = null;

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// シングルインスタンスロック
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', (event, argv, workingDirectory) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

app.on('window-all-closed', () => app.quit());

// IPCハンドラー
ipcMain.handle('select-file', async () => {
    const dialogOptions = process.platform === 'win32'
        ? ['openFile']
        : ['openFile', 'openDirectory'];

    const result = await dialog.showOpenDialog(mainWindow, {
        properties: dialogOptions,
        filters: [
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    return result.filePaths[0];
});

ipcMain.handle('select-base-path', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        defaultPath: defaultBasePath
    });
    return result.filePaths[0] || null;
});

ipcMain.handle('handle-path', async (event, filePath, basePath) => {
    try {
        const stats = await fs.promises.stat(filePath);
        return {
            success: true,
            path: filePath,
            basePath: basePath || defaultBasePath,
            isDirectory: stats.isDirectory()
        };
    } catch (error) {
        console.error('Path handling error:', error);
        return {
            success: false,
            error: error.message
        };
    }
});

ipcMain.handle('write-to-clipboard', async (event, text) => {
    if (typeof text !== 'string') throw new Error('Invalid text format');
    clipboard.writeText(text);
    return { success: true };
});

ipcMain.handle('get-file-info', async (event, filePath) => {
    if (!filePath) throw new Error('No file path provided');
    
    const stats = await fs.promises.stat(filePath);
    const info = {
        size: stats.size,
        isDirectory: stats.isDirectory()
    };

    if (!info.isDirectory) {
        const ext = path.extname(filePath).toLowerCase();
        info.isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
    }

    try {
        const icon = await app.getFileIcon(filePath, { size: 'large' });
        if (icon && !icon.isEmpty()) {
            info.iconDataUrl = icon.toDataURL({ scaleFactor: 2 });
        }
    } catch {
        info.iconDataUrl = null;
    }

    return { success: true, info };
});

// システムロケールを取得するハンドラー
ipcMain.handle('get-system-locale', () => {
    return app.getLocale();
});

// クリップボードから読み取るハンドラー
ipcMain.handle('read-from-clipboard', () => {
    return clipboard.readText();
}); 