document.addEventListener('DOMContentLoaded', () => {
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
        if (bytes === 0) return '0 バイト';
        const k = 1024;
        const sizes = ['バイト', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    async function updateDropZoneUI(path) {
        if (path) {
            const name = path.split('/').pop().split('\\').pop();
            fileName.textContent = name;
            fileInfo.classList.add('visible');
            dropZone.classList.add('has-file');

            // ファイル情報を取得
            const result = await window.electronAPI.getFileInfo(path);
            if (result.success) {
                const { info } = result;
                
                // アイコンを設定（フォールバックアイコンを先に設定）
                fileIcon.textContent = info.isDirectory ? '📁' : '📄';
                
                // システムアイコンがある場合は上書き
                if (info.iconDataUrl) {
                    const img = new Image();
                    img.onload = () => {
                        fileIcon.innerHTML = `<img src="${info.iconDataUrl}" width="32" height="32">`;
                    };
                    img.src = info.iconDataUrl;
                }
                
                // 表示テキストを設定
                if (info.isDirectory) {
                    fileName.textContent = `${name} (フォルダ)`;
                } else {
                    const sizeText = formatFileSize(info.size);
                    fileName.textContent = `${name} (${sizeText})`;
                    
                    if (info.isImage) {
                        fileName.textContent = `${name} (${sizeText}) - 画像ファイル`;
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
                fmWinFullPath.value = `filewin:/${winFullPath}`;
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
            console.error('起点フォルダ選択エラー:', error);
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
            console.error('ファイル選択エラー:', error);
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
});

// パスをクリップボードにコピーする関数
async function copyPath(elementId) {
    try {
        const input = document.getElementById(elementId);
        const result = await window.electronAPI.writeToClipboard(input.value);
        
        if (result.success) {
            const button = document.querySelector(`button[onclick="copyPath('${elementId}')"]`);
            const originalText = button.textContent;
            button.textContent = 'コピーしました！';
            button.classList.add('copied');
            
            setTimeout(() => {
                button.textContent = originalText;
                button.classList.remove('copied');
            }, 2000);
        }
    } catch (error) {
        console.error('コピーエラー:', error);
    }
} 