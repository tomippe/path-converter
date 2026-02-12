// 言語データを保持する変数
let i18n = {};

// システムロケールを取得する関数
async function getSystemLocale() {
    try {
        const locale = await window.electronAPI.getSystemLocale();
        const supportedLocales = ['ja', 'en', 'zh'];
        const lang = locale.split('-')[0].toLowerCase();
        
        if (supportedLocales.includes(lang)) {
            return lang;
        }
        return 'en';
    } catch (error) {
        return 'en';
    }
}

// 言語ファイルを読み込む関数
async function loadLanguageFile(forceLang = null) {
    try {
        const systemLocale = await getSystemLocale();
        const lang = forceLang || systemLocale;
        
        const langPath = `../locales/${lang}.json`;
        const response = await fetch(langPath);
        if (response.ok) {
            i18n = await response.json();
        } else {
            const fallbackResponse = await fetch('../locales/en.json');
            i18n = await fallbackResponse.json();
        }
        
        updateUILabels();
    } catch (error) {
        try {
            const fallbackResponse = await fetch('../locales/en.json');
            i18n = await fallbackResponse.json();
            updateUILabels();
        } catch (fallbackError) {
            console.error('Failed to load language file:', fallbackError);
        }
    }
}

// UIラベルを更新する関数
function updateUILabels() {
    // タイトルの更新
    document.title = i18n.title;

    // ドロップゾーンのメッセージを更新
    const dropMessage = document.querySelector('.drop-message');
    if (dropMessage) {
        dropMessage.textContent = i18n.input.dropzone.message;
    }

    // 起点フォルダ選択ボタンとプレースホルダーを更新
    const selectBasePathButton = document.getElementById('selectBasePathButton');
    if (selectBasePathButton) {
        selectBasePathButton.textContent = i18n.input.basePath.button;
    }
    const basePath = document.getElementById('basePath');
    if (basePath) {
        basePath.placeholder = i18n.input.basePath.placeholder;
    }

    // パスタイプのボタンを更新
    const buttonLabels = {
        'unixRelativePathButton': i18n.pathTypes.unix.relative,
        'unixPathButton': i18n.pathTypes.unix.full,
        'windowsRelativePathButton': i18n.pathTypes.windows.relative,
        'windowsPathButton': i18n.pathTypes.windows.full,
        'htmlRelativePathButton': i18n.pathTypes.html.relative,
        'htmlPathButton': i18n.pathTypes.html.full,
        'fmRelativePathButton': i18n.pathTypes.filemaker.relative,
        'fmMacRelativePathButton': i18n.pathTypes.filemaker.macRelative,
        'fmWinRelativePathButton': i18n.pathTypes.filemaker.winRelative,
        'fmMacFullPathButton': i18n.pathTypes.filemaker.macFull,
        'fmWinFullPathButton': i18n.pathTypes.filemaker.winFull
    };

    Object.entries(buttonLabels).forEach(([id, label]) => {
        const button = document.getElementById(id);
        if (button) {
            button.textContent = label;
        }
    });

    // パスタイプのラベルを更新
    updatePathTypeLabels();
}

// クリップボードにコピーする関数
async function copyToClipboard(text) {
    try {
        await window.electronAPI.writeToClipboard(text);
        showMessage(i18n.clipboard.copied);
    } catch (error) {
        showMessage(i18n.clipboard.error);
    }
}

// クリップボードから貼り付ける関数
async function pasteFromClipboard() {
    try {
        const text = await window.electronAPI.readFromClipboard();
        document.getElementById('inputPath').value = text;
        convertPath();
    } catch (error) {
        showMessage(i18n.clipboard.error);
    }
}

// メッセージを表示する関数
function showMessage(message) {
    const messageEl = document.getElementById('message');
    messageEl.textContent = message;
    messageEl.style.opacity = '1';
    setTimeout(() => {
        messageEl.style.opacity = '0';
    }, 2000);
}

// デバッグ用の言語切り替え関数をグローバルに公開
window.setLanguage = async (lang) => {
    await loadLanguageFile(lang);
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await loadLanguageFile();
        console.log('[DEBUG] DOM Content Loaded');
        
        const dropZone = document.getElementById('dropZone');
        const basePath = document.getElementById('basePath');
        const unixPath = document.getElementById('unixPath');
        const unixRelativePath = document.getElementById('unixRelativePath');
        const htmlPath = document.getElementById('htmlPath');
        const htmlRelativePath = document.getElementById('htmlRelativePath');
        const windowsPath = document.getElementById('windowsPath');
        const windowsRelativePath = document.getElementById('windowsRelativePath');
        const fmRelativePath = document.getElementById('fmRelativePath');
        const fmMacRelativePath = document.getElementById('fmMacRelativePath');
        const fmWinRelativePath = document.getElementById('fmWinRelativePath');
        const fmMacFullPath = document.getElementById('fmMacFullPath');
        const fmWinFullPath = document.getElementById('fmWinFullPath');
        const fileInfo = dropZone.querySelector('.file-info');
        const fileName = fileInfo.querySelector('.file-name');
        const fileIcon = fileInfo.querySelector('.file-icon');
        const dropMessage = dropZone.querySelector('.drop-message');

        // パス表示の入力フィールドに全選択機能を追加
        const pathInputs = document.querySelectorAll('.path-input, .base-path-input');
        pathInputs.forEach(input => {
            input.addEventListener('focus', (e) => {
                e.target.select();
            });
            input.addEventListener('mouseup', (e) => {
                e.preventDefault();  // デフォルトの選択解除を防止
            });
        });

        // デフォルトの起点フォルダを設定
        window.electronAPI.onSetDefaultBasePath((defaultPath) => {
            console.log('[DEBUG] Setting default base path:', defaultPath);
            basePath.value = defaultPath;
        });

        function getRelativePath(fullPath, baseDirPath) {
            if (!baseDirPath) return fullPath.split('/').pop();
            
            const baseDir = baseDirPath.replace(/\\/g, '/').replace(/\/$/, '');
            const targetPath = fullPath.replace(/\\/g, '/').replace(/\/$/, '');
            
            // 共通のプレフィックスを見つける
            const baseParts = baseDir.split('/');
            const targetParts = targetPath.split('/');
            
            let commonLength = 0;
            for (let i = 0; i < Math.min(baseParts.length, targetParts.length); i++) {
                if (baseParts[i] !== targetParts[i]) break;
                commonLength = i + 1;
            }
            
            // 上の階層に移動する必要がある回数
            const upCount = baseParts.length - commonLength;
            
            // 相対パスの構築
            const relativeParts = [];
            // 必要な数だけ上の階層に移動
            for (let i = 0; i < upCount; i++) {
                relativeParts.push('..');
            }
            // 残りのパスを追加
            relativeParts.push(...targetParts.slice(commonLength));
            
            return relativeParts.join('/');
        }

        function getMacFullPath(unixPath) {
            // Windowsのドライブレター（例：C:）を削除
            unixPath = unixPath.replace(/^[A-Za-z]:/, '');
            
            // パスを/で分割
            const parts = unixPath.split('/').filter(Boolean);
            
            // Volumesディレクトリ経由のパスかチェック
            if (parts[0] === 'Volumes') {
                // Volumesを除去して共有ボリュームパスを構築
                return '/' + parts.slice(1).join('/');
            }
            
            // 通常のローカルパスの場合
            return '/Macintosh HD' + unixPath;
        }

        function formatFileSize(bytes) {
            if (bytes === 0) return `0 ${i18n.fileInfo.size.byte}`;
            const k = 1024;
            const sizes = [
                i18n.fileInfo.size.byte,
                i18n.fileInfo.size.kb,
                i18n.fileInfo.size.mb,
                i18n.fileInfo.size.gb
            ];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }

        async function updateDropZoneUI(path) {
            if (path) {
                const name = path.split('/').pop().split('\\').pop();
                fileName.textContent = name;
                fileInfo.classList.add('visible');
                dropZone.classList.add('has-file');

                const result = await window.electronAPI.getFileInfo(path);
                if (result.success) {
                    const { info } = result;
                    
                    fileIcon.textContent = info.isDirectory ? '📁' : '📄';
                    
                    if (info.iconDataUrl) {
                        const img = new Image();
                        img.onload = () => {
                            fileIcon.innerHTML = `<img src="${info.iconDataUrl}" width="32" height="32">`;
                        };
                        img.src = info.iconDataUrl;
                    }
                    
                    if (info.isDirectory) {
                        fileName.textContent = `${name} (${i18n.fileInfo.folder})`;
                    } else {
                        const sizeText = formatFileSize(info.size);
                        fileName.textContent = `${name} (${sizeText})`;
                        
                        if (info.isImage) {
                            fileName.textContent = `${name} (${sizeText}) - ${i18n.fileInfo.imageFile}`;
                        }
                    }
                }
            } else {
                fileInfo.classList.remove('visible');
                dropZone.classList.remove('has-file');
            }
        }

        function encodePathForHtml(path) {
            // URLエンコードを行うが、一部の文字は保持
            return encodeURI(path).replace(/%2F/g, '/');
        }

        async function handlePath(filePath) {
            console.log('[DEBUG] Processing path:', filePath);
            try {
                const result = await window.electronAPI.handlePath(filePath, basePath.value);
                console.log('[DEBUG] Handle path result:', result);
                if (result.success) {
                    updateDropZoneUI(result.path);
                    // UNIXスタイルのパス（相対）
                    const unixStyle = result.path.replace(/\\/g, '/');
                    unixRelativePath.value = getRelativePath(unixStyle, result.basePath);

                    // UNIXスタイルのパス（完全）
                    unixPath.value = unixStyle;

                    // HTMLスタイルのパス（相対）
                    const htmlRelative = getRelativePath(unixStyle, result.basePath);
                    htmlRelativePath.value = `file://${encodePathForHtml(htmlRelative)}`;

                    // HTMLスタイルのパス（完全）
                    htmlPath.value = `file://${encodePathForHtml(unixStyle)}`;

                    // Windowsスタイルのパス（相対）
                    const winRelative = getRelativePath(unixStyle, result.basePath).replace(/\//g, '\\');
                    windowsRelativePath.value = winRelative;

                    // Windowsスタイルのパス（完全）
                    const winStyle = result.path.replace(/\//g, '\\');
                    const driveMatch = winStyle.match(/^([A-Za-z]:)/);
                    const driveLetter = driveMatch ? driveMatch[1] : 'C:';
                    windowsPath.value = winStyle.startsWith(driveLetter) ? winStyle : `${driveLetter}${winStyle}`;

                    // 相対パスを計算
                    const relativePath = getRelativePath(unixStyle, result.basePath);
                    
                    // FileMaker相対パス（共通）
                    fmRelativePath.value = `file:${relativePath}`;
                    
                    // FileMaker Mac相対パス
                    fmMacRelativePath.value = `filemac:${relativePath}`;
                    
                    // FileMaker Mac完全パス
                    const macFullPath = getMacFullPath(unixStyle);
                    fmMacFullPath.value = `filemac:${macFullPath}`;
                    
                    // FileMaker Windows相対パス
                    fmWinRelativePath.value = `filewin:${relativePath}`;
                    
                    // FileMaker Windows完全パス
                    const winFullPath = winStyle.startsWith(driveLetter) ? winStyle : `${driveLetter}${winStyle}`;
                    fmWinFullPath.value = `filewin:/${winFullPath.replace(/\\/g, '/')}`;
                }
            } catch (error) {
                console.error('[DEBUG] Path processing error:', error);
            }
        }

        // ドロップされたファイルを処理するイベントリスナー
        window.electronAPI.onHandleDroppedFile(async (filePath) => {
            console.log('[DEBUG] Handling dropped file in renderer:', filePath);
            if (filePath) {
                await handlePath(filePath);
            }
        });

        // 起点フォルダ選択
        window.selectBasePath = async () => {
            try {
                const selectedPath = await window.electronAPI.selectBasePath();
                if (selectedPath) {
                    basePath.value = selectedPath;
                    // 現在のパスを再計算
                    const currentPath = unixPath.value;
                    if (currentPath) {
                        await handlePath(currentPath);
                    }
                }
            } catch (error) {
                console.error(i18n.errors.basePath, error);
            }
        };

        // ドロップゾーンのクリックハンドラー
        dropZone.addEventListener('click', async () => {
            try {
                const filePath = await window.electronAPI.selectFile();
                if (filePath) {
                    await handlePath(filePath);
                }
            } catch (error) {
                console.error(i18n.errors.fileSelect, error);
            }
        });

        // ドラッグ&ドロップハンドラー
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('dragover');
        });

        dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('dragover');
        });

        dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('dragover');
            
            const file = e.dataTransfer.files[0];
            if (file) {
                await handlePath(file.path);
            }
        });
    } catch (error) {
        console.error('Initialization error:', error);
    }
});

// パスをクリップボードにコピーする関数
async function copyPath(elementId) {
    try {
        const input = document.getElementById(elementId);
        const result = await window.electronAPI.writeToClipboard(input.value);
        
        if (result.success) {
            const button = document.querySelector(`button[onclick="copyPath('${elementId}')"]`);
            const originalText = button.textContent;
            button.textContent = i18n.output.copySuccess;
            button.classList.add('copied');
            
            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('copied');
            }, 2000);
        }
    } catch (error) {
        console.error(i18n.clipboard.error, error);
    }
}

// パスタイプのラベルを更新
function updatePathTypeLabels() {
    const labels = {
        'unixRelativePath': i18n.pathTypes.unix.relative,
        'unixPath': i18n.pathTypes.unix.full,
        'windowsRelativePath': i18n.pathTypes.windows.relative,
        'windowsPath': i18n.pathTypes.windows.full,
        'htmlRelativePath': i18n.pathTypes.html.relative,
        'htmlPath': i18n.pathTypes.html.full,
        'fmRelativePath': i18n.pathTypes.filemaker.relative,
        'fmMacRelativePath': i18n.pathTypes.filemaker.macRelative,
        'fmWinRelativePath': i18n.pathTypes.filemaker.winRelative,
        'fmMacFullPath': i18n.pathTypes.filemaker.macFull,
        'fmWinFullPath': i18n.pathTypes.filemaker.winFull
    };

    Object.entries(labels).forEach(([id, label]) => {
        const labelElement = document.querySelector(`label[for="${id}"]`);
        if (labelElement) {
            labelElement.textContent = label;
        }
    });
} 