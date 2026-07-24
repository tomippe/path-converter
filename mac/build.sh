#!/bin/bash
set -e

# ===== Path Converter Mac ビルドスクリプト (App Store版のみ) =====

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

APP_NAME="path-converter"
BUNDLE_ID="jp.tomippe.pathconverter"
DIRECT_ZIP_NAME="${APP_NAME}_mac.zip"
PKG_NAME="PathConverter.pkg"
MAC_BUILD_DIR="mac/build"
DIST_DIR="../apps.tomippe.jp/path-converter"
VERSION_FILE="$PROJECT_ROOT/version.txt"

INSTALLER_IDENTITY="3rd Party Mac Developer Installer: TOMIHIDE OTA (4U63Y3X98K)"
APPLE_ID="tomi@tomippe.jp"

source "$PROJECT_ROOT/../build-common/version.sh"
source "$PROJECT_ROOT/../build-common/ftp-upload.sh"
source "$PROJECT_ROOT/../build-common/git-commit.sh"
source "$PROJECT_ROOT/../build-common/apple-altool-lib.sh"

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

VERSION=$(version_read "$VERSION_FILE")
echo "📝 version.txt のバージョン ${VERSION} を package.json に反映します..."
sed -i '' 's/"version": "[^"]*"/"version": "'$VERSION'"/' package.json

echo "🚀 ${APP_NAME} v${VERSION} のビルドを開始します (App Store版のみ)..."

if [ -f "$HOME/.apple-env" ]; then
    # shellcheck disable=SC1090
    source "$HOME/.apple-env"
fi
APPLE_ID="${APPLE_ID:-tomi@tomippe.jp}"

if [ -f "mac/icon.png" ]; then
    echo "🎨 アイコンファイルを生成中..."
    mkdir -p .tmp/icons.iconset

    sizes=(16 32 64 128 256 512 1024)
    for size in "${sizes[@]}"; do
        sips -z $size $size mac/icon.png --out ".tmp/icons.iconset/icon_${size}x${size}.png"
        if [ $size -le 512 ]; then
            sips -z $((size*2)) $((size*2)) mac/icon.png --out ".tmp/icons.iconset/icon_${size}x${size}@2x.png"
        fi
    done

    iconutil -c icns .tmp/icons.iconset -o mac/icon.icns
    rm -rf .tmp
    echo "✅ アイコンファイルの生成が完了しました"
fi

echo "🧹 キャッシュとビルドファイルを削除中..."
rm -rf "$MAC_BUILD_DIR"
rm -rf out/
rm -rf node_modules/
rm -rf ~/.electron-builder/cache/
rm -rf ~/.electron/cache/
rm -rf .webpack/

echo "📦 依存関係をインストール中..."
npm install --force --ignore-platform

echo ""
echo "========== App Store版 =========="
echo "📄 プロビジョニングプロファイルを API で更新中..."
ruby "$PROJECT_ROOT/scripts/asc-refresh-mac-profile.rb"

echo "📦 App Store版をビルド中..."
export CSC_KEYCHAIN="${CSC_KEYCHAIN:-$HOME/Library/Keychains/login.keychain-db}"
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mas-signed

MAS_APP="$MAC_BUILD_DIR/mas-universal/Path Converter.app"
if [ ! -d "$MAS_APP" ]; then
    echo "❌ App Store版の .app が見つかりません"
    exit 1
fi
echo "✅ App Store版のビルド・署名が完了しました"

if $APP_ONLY; then
    echo ""
    echo "✅ ${APP_NAME} v${VERSION} — ビルド完了! (-app モード)"
    echo "📁 成果物: $MAS_APP"
    exit 0
fi

echo ""
echo "📦 App Store用 pkg を作成中..."
chmod -R a+rX "$MAS_APP"
xattr -cr "$MAS_APP/Contents/embedded.provisionprofile" 2>/dev/null || true
productbuild --component "$MAS_APP" /Applications \
    --sign "$INSTALLER_IDENTITY" \
    "$MAC_BUILD_DIR/$PKG_NAME"

if [ $? -eq 0 ]; then
    echo "✅ pkg 作成完了: $MAC_BUILD_DIR/$PKG_NAME"
else
    echo "❌ pkg 作成失敗"
    exit 1
fi

echo ""
echo "📤 App Store Connect へアップロード中..."
ALTOOL_OUTPUT=$(xcrun altool --upload-app -f "$MAC_BUILD_DIR/$PKG_NAME" -t macos \
    -u "$APPLE_ID" -p "$(apple_altool_password)" 2>&1) || true
echo "$ALTOOL_OUTPUT"

if echo "$ALTOOL_OUTPUT" | grep -q "No errors"; then
    echo "✅ App Store Connect アップロード完了"
    if [ -n "$COMMIT_MSG" ] && [ -f "$PROJECT_ROOT/../build-common/update-testflight-whats-new.rb" ]; then
        echo "🧪 TestFlight のテスト内容を更新中..."
        ruby "$PROJECT_ROOT/../build-common/update-testflight-whats-new.rb" \
            --bundle-id "$BUNDLE_ID" \
            --version "$VERSION" \
            --build-number "$VERSION" \
            --locale "${TESTFLIGHT_WHAT_TO_TEST_LOCALE:-ja-JP}" \
            --notes "v${VERSION} - ${COMMIT_MSG}" || echo "  ⚠️ TestFlight のテスト内容更新をスキップしました"
    fi
else
    echo "⚠️  App Store Connect アップロード失敗（手動でアップロードしてください）"
fi

echo ""
echo "🗑  直接配布版 ZIP を削除しています..."
rm -f "$DIST_DIR/$DIRECT_ZIP_NAME"
ftp_delete_file "path-converter/$DIRECT_ZIP_NAME"

python3 -c "
import json, os
path = '$DIST_DIR/manifest.json'
data = {}
if os.path.exists(path):
    with open(path) as f: data = json.load(f)
data['name'] = 'PathConverter'
data['version'] = '$VERSION'
data.pop('mac_version', None)
with open(path, 'w') as f: json.dump(data, f)
"
ftp_upload_file "$DIST_DIR/manifest.json" "path-converter/manifest.json"

if ! $NO_VERUP; then
    echo ""
    echo "📝 次回用バージョンを更新しています..."
    version_save_next "$VERSION" "$VERSION_FILE"
fi

git_commit_build "$VERSION" "$COMMIT_MSG"

echo ""
echo "🎉 ${APP_NAME} v${VERSION} — ビルド完了!"
echo ""
echo "App Store版 (App Store Connect にアップロード済み):"
echo "  $MAC_BUILD_DIR/$PKG_NAME"
