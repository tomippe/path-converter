document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    const results = document.getElementById('results');
    const unixPath = document.getElementById('unixPath');
    const windowsPath = document.getElementById('windowsPath');
    const filemakerRelativePath = document.getElementById('filemakerRelativePath');
    const filemakerMacRelativePath = document.getElementById('filemakerMacRelativePath');
    const filemakerWinRelativePath = document.getElementById('filemakerWinRelativePath');
    const filemakerMacFullPath = document.getElementById('filemakerMacFullPath');
    const filemakerWinFullPath = document.getElementById('filemakerWinFullPath');

    // ファイル選択時の処理
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            
            // ファイルパスを取得（セキュリティのため、ファイル名のみ取得可能）
            const fileName = file.name;
            const isDirectory = file.size === 0 && file.type === '';
            
            // UNIXパス
            const unixStyle = fileName.replace(/\\/g, '/');
            unixPath.value = unixStyle;

            // Windowsパス
            const windowsStyle = fileName.replace(/\//g, '\\');
            windowsPath.value = windowsStyle;

            // FileMaker相対パス
            filemakerRelativePath.value = 'file:' + unixStyle;

            // FileMaker Mac相対パス
            filemakerMacRelativePath.value = 'filemac:' + unixStyle + (isDirectory ? '/' : '');

            // FileMaker Windows相対パス
            filemakerWinRelativePath.value = 'filewin:../' + unixStyle;

            // FileMaker Mac完全パス
            filemakerMacFullPath.value = 'filemac:/Volumes/' + unixStyle;

            // FileMaker Windows完全パス
            filemakerWinFullPath.value = 'filewin:/C:/' + windowsStyle;

            // 結果を表示
            results.style.display = 'block';
        }
    });

    // コピーボタンの処理
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            const input = document.getElementById(targetId);
            input.select();
            document.execCommand('copy');

            // コピー成功のフィードバック
            const originalText = btn.textContent;
            btn.textContent = 'コピー済';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-success');

            setTimeout(() => {
                btn.textContent = originalText;
                btn.classList.remove('btn-success');
                btn.classList.add('btn-primary');
            }, 1000);
        });
    });
}); 