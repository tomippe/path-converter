#!/bin/bash
# MAS 用: electron-builder 後に Apple Distribution で全ファイルを深い順に再署名
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

APP="${1:-mac/build/mas-universal/Path Converter.app}"
IDENTITY="${MAS_SIGN_IDENTITY:-}"
BUNDLE_ID="${MAS_BUNDLE_ID:-jp.tomippe.pathconverter}"
KEYCHAIN="${CSC_KEYCHAIN:-$HOME/Library/Keychains/login.keychain-db}"
ENT_MAIN="mac/entitlements.mas.plist"
ENT_INHERIT="mac/entitlements.mas.inherit.plist"
ENT_HELPER="mac/entitlements.mas.helper.plist"
PROVISION="mac/PathConverter.provisionprofile"
MAIN_EXE="Path Converter"

[ -d "$APP" ] || { echo "❌ $APP not found"; exit 1; }
[ -f "$PROVISION" ] || { echo "❌ $PROVISION not found"; exit 1; }

if [ -z "$IDENTITY" ]; then
  PROFILE_PLIST=$(mktemp)
  PROFILE_CERT=$(mktemp)
  security cms -D -i "$PROVISION" > "$PROFILE_PLIST" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c 'Print :DeveloperCertificates:0' "$PROFILE_PLIST" > "$PROFILE_CERT" 2>/dev/null || true
  PROFILE_SHA1=$(openssl x509 -inform der -in "$PROFILE_CERT" -noout -fingerprint -sha1 2>/dev/null | sed 's/.*=//' | tr -d ':')
  rm -f "$PROFILE_PLIST" "$PROFILE_CERT"
  if [ -n "$PROFILE_SHA1" ]; then
    MATCH_LINE=$(security find-identity -v -p codesigning -s "$KEYCHAIN" 2>/dev/null | grep -i "$PROFILE_SHA1" | head -n1 || true)
    if [ -n "$MATCH_LINE" ]; then
      IDENTITY=$(echo "$MATCH_LINE" | awk '{print $2}' | tr -d '"')
      echo "🔐 プロファイル内証明書: $IDENTITY"
    fi
  fi
fi
if [ -z "$IDENTITY" ]; then
  MATCH_LINE=$(security find-identity -v -p codesigning -s "$KEYCHAIN" 2>/dev/null | grep -iE "Apple Distribution|3rd Party Mac Developer Application" | head -n1 || true)
  if [ -n "$MATCH_LINE" ]; then
    IDENTITY=$(echo "$MATCH_LINE" | awk '{print $2}' | tr -d '"')
    echo "🔐 Apple Distribution identity (fallback): $IDENTITY"
  else
    echo "❌ Apple Distribution 証明書が見つかりません"
    exit 1
  fi
fi

sign() {
  local target="$1" ent="$2" ident="${3:-}"
  local -a args=(--force --sign "$IDENTITY" --keychain "$KEYCHAIN" --options runtime --timestamp)
  [ -n "$ent" ] && args+=(--entitlements "$ent")
  [ -n "$ident" ] && args+=(--identifier "$ident")
  codesign "${args[@]}" "$target"
}

sign_resource() {
  codesign --force --sign "$IDENTITY" --keychain "$KEYCHAIN" --timestamp "$1"
}

make_main_entitlements() {
  local out="$1"
  local team_id
  team_id=$(security cms -D -i "$PROVISION" 2>/dev/null | plutil -extract TeamIdentifier.0 raw -o - -)
  cp "$ENT_MAIN" "$out"
  /usr/libexec/PlistBuddy -c "Delete :com.apple.application-identifier" "$out" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Delete :com.apple.developer.team-identifier" "$out" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :com.apple.application-identifier string ${team_id}.${BUNDLE_ID}" "$out"
  /usr/libexec/PlistBuddy -c "Add :com.apple.developer.team-identifier string ${team_id}" "$out"
}

make_inherit_entitlements() {
  cp "$ENT_INHERIT" "$1"
}

by_depth() {
  find "$APP/Contents" "$@" -print 2>/dev/null | awk '{ print length($0), $0 }' | sort -rn | cut -d' ' -f2-
}

echo "🔏 MAS 再署名: $APP"
rm -f "$APP/Contents/embedded.mobileprovision" "$APP/Contents/embedded.provisionprofile"

TEAM_ID=$(security cms -D -i "$PROVISION" 2>/dev/null | plutil -extract TeamIdentifier.0 raw -o - -)
MAIN_ENT=$(mktemp).plist
INHERIT_ENT=$(mktemp).plist
make_main_entitlements "$MAIN_ENT"
make_inherit_entitlements "$INHERIT_ENT"
trap 'rm -f "${MAIN_ENT:-}" "${INHERIT_ENT:-}"' EXIT

while IFS= read -r plist; do
  /usr/libexec/PlistBuddy -c "Delete :ElectronTeamID" "$plist" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :ElectronTeamID string ${TEAM_ID}" "$plist"
done < <(find "$APP" -name Info.plist -path "*/Contents/Info.plist" -print)

while IFS= read -r f; do
  [ -n "$f" ] && sign "$f" "$INHERIT_ENT"
done < <(by_depth -name "*.dylib")

while IFS= read -r f; do
  [ -n "$f" ] && sign "$f" "$INHERIT_ENT"
done < <(by_depth -name "*.node")

while IFS= read -r f; do
  sign "$f" "$INHERIT_ENT"
done < <(by_depth -type f \( -path "*/Versions/*/MacOS/*" -o -path "*/Versions/A/Electron Framework" \) -perm +111)

while IFS= read -r helper; do
  [ -z "$helper" ] && continue
  bid=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$helper/Contents/Info.plist" 2>/dev/null || true)
  exe_name=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$helper/Contents/Info.plist" 2>/dev/null || true)
  exe="$helper/Contents/MacOS/$exe_name"
  [ -f "$exe" ] && sign "$exe" "$INHERIT_ENT" "$bid"
  sign "$helper" "$INHERIT_ENT" "$bid"
done < <(find "$APP/Contents/Frameworks" -maxdepth 1 -name "*.app" -print | sort -r)

while IFS= read -r plug; do
  [ -z "$plug" ] && continue
  exe_name=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$plug/Contents/Info.plist" 2>/dev/null || true)
  exe="$plug/Contents/MacOS/$exe_name"
  [ -f "$exe" ] && sign "$exe" "$INHERIT_ENT"
  sign "$plug" "$INHERIT_ENT"
done < <(find "$APP/Contents/PlugIns" -name "*.app" -print 2>/dev/null | sort -r)

while IFS= read -r login; do
  [ -z "$login" ] && continue
  exe_name=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$login/Contents/Info.plist" 2>/dev/null || true)
  exe="$login/Contents/MacOS/$exe_name"
  [ -f "$exe" ] && sign "$exe" "$ENT_HELPER"
  sign "$login" "$ENT_HELPER"
done < <(find "$APP/Contents/Library/LoginItems" -name "*.app" -print 2>/dev/null | sort -r)

while IFS= read -r fw; do
  [ -n "$fw" ] && sign "$fw" "$INHERIT_ENT"
done < <(by_depth -name "*.framework")

echo "📄 リソースファイルに署名..."
while IFS= read -r f; do
  sign_resource "$f"
done < <(by_depth -type f \
  ! -perm +111 \
  ! -name "*.dylib" \
  ! -path "*/embedded.provisionprofile" \
  ! -path "*/_CodeSignature/*" \
  ! -path "*/Contents/Info.plist" \
  ! -path "*/Contents/PkgInfo" \
  ! -path "*/Contents/MacOS/*")

PROFILE_STAGE=$(mktemp)
cat "$PROVISION" > "$PROFILE_STAGE"
while IFS= read -r attr; do
  xattr -d "$attr" "$PROFILE_STAGE" 2>/dev/null || true
done < <(xattr "$PROFILE_STAGE" 2>/dev/null || true)
cp "$PROFILE_STAGE" "$APP/Contents/embedded.provisionprofile"
rm -f "$PROFILE_STAGE"
sign "$APP/Contents/MacOS/$MAIN_EXE" "$MAIN_ENT" "$BUNDLE_ID"
sign "$APP" "$MAIN_ENT" "$BUNDLE_ID"
chmod -R a+rX "$APP"
while IFS= read -r attr; do
  case "$attr" in
    com.apple.quarantine|com.apple.macl|com.apple.metadata:kMDItemWhereFroms) xattr -d "$attr" "$APP/Contents/embedded.provisionprofile" 2>/dev/null || true ;;
  esac
done < <(xattr "$APP/Contents/embedded.provisionprofile" 2>/dev/null || true)

echo "🔍 リソース署名を検証..."
bad=0
while IFS= read -r f; do
  case "$f" in
    *.pak|*.asar|*.png|*.icns|*.nib|*.dat|*.bin) ;;
    *) continue ;;
  esac
  auth=$(codesign -dvv "$f" 2>&1 | grep "Authority=" | head -1 || true)
  if ! echo "$auth" | grep -qE "Apple Distribution|3rd Party Mac Developer Application"; then
    echo "  ❌ $f"
    echo "     ${auth:-（未署名）}"
    bad=1
  fi
done < <(find "$APP/Contents" -type f)
if [ "$bad" -ne 0 ]; then
  echo "❌ 90284 対策: Apple Distribution 以外の署名が残っています"
  exit 1
fi
if xattr "$APP/Contents/embedded.provisionprofile" 2>/dev/null | grep -q com.apple.quarantine; then
  echo "❌ 91109 対策: embedded.provisionprofile に quarantine が残っています"
  exit 1
fi

echo "✅ 再署名完了"
codesign -dvv "$APP" 2>&1 | grep -E "Authority|Identifier" | head -6
codesign --verify --deep --strict "$APP" 2>&1 && echo "✅ codesign --verify OK"
