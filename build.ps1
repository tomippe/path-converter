#Requires -Version 5.1
<#
.SYNOPSIS
    Path Converter Windows Build Script (Electron)
    Reads version from version.txt, builds EXE + MSIX store packages.

.EXAMPLE
    .\build.ps1              # Build EXE + MSIX
    .\build.ps1 -Exe         # Build EXE only (skip MSIX)
#>
param(
    [switch]$Exe,
    [switch]$Noverup
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$rootDir = $PSScriptRoot

# 共通スクリプト読み込み
. "$rootDir\..\build-common\helpers.ps1"
. "$rootDir\..\build-common\version.ps1"

$APP_NAME = "path-converter"
$DISPLAY_NAME = "Path Converter"

# ─── Version ───

Write-Step "Version"

$version = Read-AppVersion
Write-Ok "v$version"

# Update package.json
$pkgJson = Get-Content (Join-Path $rootDir "package.json") -Raw
$pkgJson = $pkgJson -replace '"version":\s*"[^"]*"', "`"version`": `"$version`""
Set-Content -Path (Join-Path $rootDir "package.json") -Value $pkgJson -NoNewline
Write-Ok "package.json を v$version に更新しました"

# ─── Clean & Install ───

Write-Step "Clean & Install"

$cleanDirs = @("dist", "out", ".webpack")
foreach ($d in $cleanDirs) {
    $p = Join-Path $rootDir $d
    if (Test-Path $p) { Remove-Item -Recurse -Force $p }
}
Write-Ok "クリーンアップ完了"

Write-Host "  npm install ..." -ForegroundColor Gray
Push-Location $rootDir
npm install --force 2>&1 | Out-Null
Pop-Location
Write-Ok "依存関係インストール完了"

# ─── Build Windows ───

Write-Step "Building Windows (x64 + arm64)"

Push-Location $rootDir

Write-Host "  Building x64 ..." -ForegroundColor Gray
npm run build:win-x64
if ($LASTEXITCODE -ne 0) { Write-Error "x64 build failed"; exit 1 }

Write-Host "  Building arm64 ..." -ForegroundColor Gray
npm run build:win-arm64
if ($LASTEXITCODE -ne 0) { Write-Error "arm64 build failed"; exit 1 }

Pop-Location
Write-Ok "Windows ビルド完了"

# -Exe mode: skip MSIX
if ($Exe) {
    Write-Step "Build Complete - v$version (-Exe mode)"
    Write-Host "  EXE: dist\win-unpacked\, dist\win-arm64-unpacked\" -ForegroundColor Gray
    exit 0
}

# ─── MSIX Packaging ───

Write-Step "MSIX Packaging"

function Find-MakeAppx {
    $sdkRoot = "C:\Program Files (x86)\Windows Kits\10\bin"
    if (-not (Test-Path $sdkRoot)) { return $null }
    $found = Get-ChildItem $sdkRoot -Recurse -Filter "makeappx.exe" -ErrorAction SilentlyContinue |
             Where-Object { $_.DirectoryName -like "*\x64" } |
             Sort-Object { $_.DirectoryName } -Descending |
             Select-Object -First 1
    if ($found) { return $found.FullName } else { return $null }
}

$makeappx = Find-MakeAppx
if (-not $makeappx) {
    Write-Warn "makeappx.exe が見つかりません。Windows SDK をインストールしてください。"
    Write-Warn "MSIX 作成をスキップします。"
} else {
    Write-Host "  makeappx.exe: $makeappx" -ForegroundColor Gray

    $msixVersion = "$version.0"
    $msixOutputDir = Join-Path $rootDir "dist\msix"
    New-Item -ItemType Directory -Path $msixOutputDir -Force | Out-Null

    $archMap = @{
        "x64"   = @{ unpacked = "dist\win-unpacked"; manifest = "build\manifest-x64.xml" }
        "arm64" = @{ unpacked = "dist\win-arm64-unpacked"; manifest = "build\manifest-arm64.xml" }
    }

    $msixFiles = @()
    foreach ($arch in $archMap.Keys) {
        $info = $archMap[$arch]
        $unpackedDir = Join-Path $rootDir $info.unpacked
        $manifestSrc = Join-Path $rootDir $info.manifest

        if (-not (Test-Path $unpackedDir)) {
            Write-Warn "$arch unpacked ディレクトリが見つかりません: $unpackedDir"
            continue
        }

        # Copy Assets
        $assetsDir = Join-Path $unpackedDir "Assets"
        New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
        Copy-Item (Join-Path $rootDir "build\Square150x150Logo.png") $assetsDir -Force
        Copy-Item (Join-Path $rootDir "build\Square310x310.png") $assetsDir -Force
        Copy-Item (Join-Path $rootDir "build\StoreLogo.png") $assetsDir -Force

        # Patch manifest
        $manifestContent = Get-Content $manifestSrc -Raw
        $manifestContent = $manifestContent -replace 'Version="[0-9.]+"', "Version=`"$msixVersion`""
        Set-Content -Path (Join-Path $unpackedDir "AppxManifest.xml") -Value $manifestContent -Encoding UTF8

        # Create resources.pri
        $makepri = $makeappx -replace "makeappx\.exe", "makepri.exe"
        if (Test-Path $makepri) {
            $priConfig = Join-Path $unpackedDir "priconfig.xml"
            & $makepri createconfig /cf $priConfig /dq en-US /o 2>$null
            if (Test-Path $priConfig) {
                & $makepri new /pr $unpackedDir /cf $priConfig /mn (Join-Path $unpackedDir "AppxManifest.xml") /of (Join-Path $unpackedDir "resources.pri") /o 2>$null
                Remove-Item $priConfig -Force -ErrorAction SilentlyContinue
            }
        }

        # Package
        $msixPath = Join-Path $msixOutputDir "${DISPLAY_NAME}_$arch.msix"
        & $makeappx pack /d $unpackedDir /p $msixPath /o
        if ($LASTEXITCODE -eq 0) {
            $size = [math]::Round((Get-Item $msixPath).Length / 1MB, 1)
            Write-Ok "$arch -> $msixPath ($size MB)"
            $msixFiles += $msixPath
        } else {
            Write-Warn "$arch MSIX パッケージ作成に失敗"
        }
    }

    # Bundle
    if ($msixFiles.Count -gt 0) {
        Write-Host "  Creating MSIX Bundle ..." -ForegroundColor Gray
        $bundlePath = Join-Path $msixOutputDir "${DISPLAY_NAME}.msixbundle"
        $bundleDir = Join-Path $rootDir "dist\msix-bundle-tmp"
        New-Item -ItemType Directory -Path $bundleDir -Force | Out-Null
        foreach ($m in $msixFiles) { Copy-Item $m $bundleDir }
        & $makeappx bundle /d $bundleDir /p $bundlePath /o
        if ($LASTEXITCODE -eq 0) {
            $size = [math]::Round((Get-Item $bundlePath).Length / 1MB, 1)
            Write-Ok "Bundle -> $bundlePath ($size MB)"
        }
        Remove-Item -Recurse -Force $bundleDir -ErrorAction SilentlyContinue
    }
}

# ─── Save Next Version ───

if (-not $Noverup) {
    Write-Step "Version Update"
    Save-NextAppVersion -Version $version
}

# ─── Summary ───

Write-Step "Build Complete - v$version"
Write-Host ""
Write-Host "  dist\ フォルダに成果物が格納されています" -ForegroundColor Gray
Write-Host ""
