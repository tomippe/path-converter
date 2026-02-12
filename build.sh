#!/bin/bash
set -e

# ===== Path Converter ビルドスクリプト (Mac専用) =====

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

APP_NAME="path-converter"
ZIP_NAME="${APP_NAME}_mac.zip"
DIST_DIR="../apps.tomippe.jp/path-converter"

# 共通スクリプト読み込み
source "$SCRIPT_DIR/../build-common/version.sh"
source "$SCRIPT_DIR/../build-common/ftp-upload.sh"
source "$SCRIPT_DIR/../build-common/git-commit.sh"

# ===== オプション解析 =====
APP_ONLY=false
COMMIT_MSG=""
NO_VERUP=false
while [ $# -gt 0 ]; do
    case "$1" in
        -app) APP_ONLY=true ;;
        -cm) shift; COMMIT_MSG="$1" ;;
        -noverup) NO_VERUP=true ;;
    esac
    shift || true
done

# バージョン読み込み & package.json に反映
VERSION=$(version_read)
echo "📝 version.txt のバージョン ${VERSION} を package.json に反映します..."
sed -i '' 's/"version": "[^"]*"/"version": "'$VERSION'"/' package.json

echo "🚀 ${APP_NAME} v${VERSION} のビルドを開始します..."

# アイコンの生成
if [ -f "build/icon.png" ]; then
    echo "🎨 アイコンファイルを生成中..."
    mkdir -p .tmp/icons.iconset

    sizes=(16 32 64 128 256 512 1024)
    for size in "${sizes[@]}"; do
        sips -z $size $size build/icon.png --out ".tmp/icons.iconset/icon_${size}x${size}.png"
        if [ $size -le 512 ]; then
            sips -z $((size*2)) $((size*2)) build/icon.png --out ".tmp/icons.iconset/icon_${size}x${size}@2x.png"
        fi
    done

    iconutil -c icns .tmp/icons.iconset -o build/icon.icns
    rm -rf .tmp
    echo "✅ アイコンファイルの生成が完了しました"
fi

# キャッシュとビルドファイルのクリーンアップ
echo "🧹 キャッシュとビルドファイルを削除中..."
rm -rf dist/
rm -rf out/
rm -rf node_modules/
rm -rf ~/.electron-builder/cache/
rm -rf ~/.electron/cache/
rm -rf .webpack/

# 依存関係のインストール
echo "📦 依存関係をインストール中..."
npm install --force --ignore-platform

# macOS Universal版のビルド
echo "📦 macOS Universal版をビルド中..."
npm run build:mac
if [ $? -eq 0 ]; then
    echo "✅ macOS版のビルドが完了しました"
else
    echo "❌ macOS版のビルドに失敗しました"
    exit 1
fi

# -app モード: ビルドのみで終了
if $APP_ONLY; then
    echo ""
    echo "✅ ${APP_NAME} v${VERSION} — ビルド完了! (-app モード)"
    echo "📁 成果物: dist/"
    exit 0
fi

# 公証
echo "🔐 macOS版の公証を開始します..."
xcrun notarytool submit "dist/${ZIP_NAME}" --keychain-profile "TOMIHIDE OTA" --wait
if [ $? -eq 0 ]; then
    echo "✅ 公証が完了しました"
else
    echo "❌ 公証に失敗しました"
    exit 1
fi

# 配布用ディレクトリへコピー
echo ""
echo "📂 配布用ディレクトリにコピーしています..."
if [ -d "$DIST_DIR" ]; then
    rm -f "$DIST_DIR/$ZIP_NAME"
else
    mkdir -p "$DIST_DIR"
fi
cp "dist/$ZIP_NAME" "$DIST_DIR/$ZIP_NAME"
echo "  ✓ $DIST_DIR/$ZIP_NAME にコピーしました"

# リモートサーバーへアップロード
ftp_upload_file "$DIST_DIR/$ZIP_NAME" "path-converter/$ZIP_NAME"

# manifest.json を更新してアップロード（mac_version のみ更新、win_version を保持）
python3 -c "
import json, os
path = '$DIST_DIR/manifest.json'
data = {}
if os.path.exists(path):
    with open(path) as f: data = json.load(f)
data['name'] = 'PathConverter'
data['version'] = '$VERSION'
data['mac_version'] = '$VERSION'
with open(path, 'w') as f: json.dump(data, f)
"
ftp_upload_file "$DIST_DIR/manifest.json" "path-converter/manifest.json"

# 次回用バージョン保存
if ! $NO_VERUP; then
    echo ""
    echo "📝 次回用バージョンを更新しています..."
    version_save_next "$VERSION"
fi

# Git コミット
git_commit_build "$VERSION" "$COMMIT_MSG"

echo ""
echo "🎉 ${APP_NAME} v${VERSION} — ビルド・公証完了!"
echo "📁 成果物は dist フォルダに格納されています"
