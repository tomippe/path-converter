const { app, BrowserWindow, ipcMain, dialog, clipboard, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');

// image-sizeモジュールの読み込みを遅延させる
let sizeOf;
function getSizeOf() {
    if (!sizeOf) {
        sizeOf = promisify(require('image-size'));
    }
    return sizeOf;
}

console.log('Application starting...');
console.log('Current directory:', __dirname);
console.log('Resource path:', process.resourcesPath);

let mainWindow = null;
let defaultBasePath;

function getAppPath() {
    if (app.isPackaged) {
        return path.join(process.resourcesPath, 'app.asar');
    } else {
        return __dirname;
    }
}

function createWindow() {
    console.log('Creating window...');
    if (mainWindow) {
        console.log('Window already exists');
        return;
    }

    defaultBasePath = app.getPath('home');
    console.log('Default base path:', defaultBasePath);

    try {
        mainWindow = new BrowserWindow({
            width: 900,
            height: 620,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                enableRemoteModule: false,
                preload: path.join(app.isPackaged ? process.resourcesPath : __dirname, app.isPackaged ? 'app.asar/preload.js' : 'preload.js')
            },
            autoHideMenuBar: true,
            resizable: false,
            backgroundColor: '#E5E5E5'
        });
        console.log('Window created successfully');

        // プロセス情報のログ
        console.log('Process type:', process.type);
        console.log('Process versions:', process.versions);
        console.log('Process platform:', process.platform);
        console.log('Process arch:', process.arch);

        // ウィンドウの状態をログ
        console.log('Window state:', {
            isDestroyed: mainWindow.isDestroyed(),
            isVisible: mainWindow.isVisible(),
            isModal: mainWindow.isModal(),
            webContents: mainWindow.webContents ? 'exists' : 'null'
        });

        // エラーハンドリングを強化
        mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
            console.error('Page failed to load:', { errorCode, errorDescription });
        });

        mainWindow.webContents.on('preload-error', (event, preloadPath, error) => {
            console.error('Preload script error:', { preloadPath, error });
        });

        mainWindow.webContents.on('render-process-gone', (event, details) => {
            console.error('Renderer process gone:', {
                reason: details.reason,
                exitCode: details.exitCode,
                sandboxed: details.sandboxed
            });
        });

    } catch (error) {
        console.error('Error creating window:', error);
        return;
    }

    // preloadスクリプトのパスをログ
    const preloadPath = path.join(app.isPackaged ? process.resourcesPath : __dirname, app.isPackaged ? 'app.asar/preload.js' : 'preload.js');
    console.log('Preload script path:', preloadPath);
    console.log('Preload script exists:', fs.existsSync(preloadPath));

    // 開発者ツールを強制的に開く
    mainWindow.webContents.openDevTools();

    // エラーハンドリングを追加
    mainWindow.webContents.on('crashed', (event) => {
        console.error('Renderer crashed:', event);
    });

    process.on('uncaughtException', (error) => {
        console.error('Uncaught exception:', error);
    });

    const indexPath = path.join(app.isPackaged ? process.resourcesPath : __dirname, app.isPackaged ? 'app.asar/index.html' : 'index.html');
    console.log('Loading index.html from:', indexPath);
    
    // ファイルの存在確認を追加
    if (!fs.existsSync(indexPath)) {
        console.error('index.html not found at path:', indexPath);
        return;
    }

    mainWindow.loadFile(indexPath).then(() => {
        console.log('index.html loaded successfully');
    }).catch(error => {
        console.error('Error loading index.html:', error);
    });

    mainWindow.webContents.on('did-finish-load', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('set-default-base-path', defaultBasePath);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
        global.gc && global.gc();
    });
}

app.whenReady().then(() => {
    createWindow();
    
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPCハンドラーの最適化
ipcMain.handle('select-file', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile', 'openDirectory']
        });
        return result.filePaths[0] || null;
    } catch (error) {
        console.error('File selection error:', error);
        return null;
    }
});

ipcMain.handle('select-base-path', async () => {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
            defaultPath: defaultBasePath
        });
        return result.filePaths[0] || null;
    } catch (error) {
        console.error('Base path selection error:', error);
        return null;
    }
});

ipcMain.handle('handle-path', async (event, filePath, basePath) => {
    try {
        if (!filePath) throw new Error('No file path provided');
        return {
            success: true,
            path: filePath,
            basePath: basePath || defaultBasePath
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
    try {
        if (typeof text !== 'string') throw new Error('Invalid text format');
        clipboard.writeText(text);
        return { success: true };
    } catch (error) {
        console.error('Clipboard error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('get-file-info', async (event, filePath) => {
    try {
        if (!filePath) throw new Error('No file path provided');
        const stats = await fs.promises.stat(filePath);
        const info = {
            size: stats.size,
            isDirectory: stats.isDirectory()
        };

        try {
            const icon = await app.getFileIcon(filePath, { size: 'normal' });
            info.iconDataUrl = icon.toDataURL();
        } catch (e) {
            console.error('Icon retrieval error:', e);
            info.iconDataUrl = null;
        }

        if (!info.isDirectory) {
            try {
                const dimensions = await getSizeOf()(filePath);
                if (dimensions) {
                    info.width = dimensions.width;
                    info.height = dimensions.height;
                    info.isImage = true;
                }
            } catch (e) {
                info.isImage = false;
            }
        }

        return { success: true, info };
    } catch (error) {
        console.error('File info error:', error);
        return { success: false, error: error.message };
    }
}); 