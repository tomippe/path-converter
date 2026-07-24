#Requires -Version 5.1
<#
.SYNOPSIS
    Path Converter Windows Build Script (Electron)

.EXAMPLE
    .\windows\build.ps1
    .\windows\build.ps1 -Exe
    .\windows\build.ps1 -Noverup
#>
param(
    [switch]$Exe,
    [switch]$Noverup
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$windowsDir = $PSScriptRoot
$rootDir = (Resolve-Path (Join-Path $windowsDir "..")).Path
$winBuildDir = Join-Path $windowsDir "build"
$winResourcesDir = Join-Path $windowsDir "resources"
$versionFile = Join-Path $windowsDir "version.txt"

. (Join-Path $rootDir "..\build-common\helpers.ps1")
. (Join-Path $rootDir "..\build-common\version.ps1")
. (Join-Path $rootDir "..\build-common\ftp-upload.ps1")

$APP_NAME = "path-converter"
$DISPLAY_NAME = "Path Converter"
$DIST_DIR = Join-Path $rootDir "..\apps.tomippe.jp\path-converter"

Write-Step "Version"

$version = Read-AppVersion -VersionFile $versionFile
Write-Ok "v$version"

$pkgJsonPath = Join-Path $rootDir "package.json"
$pkgJson = Get-Content $pkgJsonPath -Raw
$pkgJson = $pkgJson -replace '"version":\s*"[^"]*"', "`"version`": `"$version`""
Set-Content -Path $pkgJsonPath -Value $pkgJson -NoNewline
Write-Ok "package.json を v$version に更新しました"

Write-Step "Clean & Install"

$cleanDirs = @(
    (Join-Path $rootDir "out"),
    (Join-Path $rootDir ".webpack"),
    $winBuildDir
)
foreach ($p in $cleanDirs) {
    if (Test-Path $p) { Remove-Item -Recurse -Force $p }
}
Write-Ok "クリーンアップ完了"

Write-Host "  npm install ..." -ForegroundColor Gray
Push-Location $rootDir
npm install --force 2>&1 | Out-Null
Pop-Location
Write-Ok "依存関係インストール完了"

Write-Step "Building Windows (x64 + arm64)"

$ebLocal = Join-Path $windowsDir "scripts\electron-builder-local.ps1"

Write-Host "  Building x64 ..." -ForegroundColor Gray
& $ebLocal -ProjectDir $rootDir -Arch x64

Write-Host "  Building arm64 ..." -ForegroundColor Gray
& $ebLocal -ProjectDir $rootDir -Arch arm64

Write-Ok "Windows ビルド完了"

if ($Exe) {
    Write-Step "Build Complete - v$version (-Exe mode)"
    Write-Host '  windows\build\win-unpacked\  windows\build\win-arm64-unpacked\' -ForegroundColor Gray
    exit 0
}

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
    $msixOutputDir = Join-Path $winBuildDir "msix"
    New-Item -ItemType Directory -Path $msixOutputDir -Force | Out-Null

    $archMap = @{
        "x64"   = @{ unpacked = "win-unpacked"; manifest = "manifest-x64.xml" }
        "arm64" = @{ unpacked = "win-arm64-unpacked"; manifest = "manifest-arm64.xml" }
    }

    $msixFiles = @()
    foreach ($arch in $archMap.Keys) {
        $info = $archMap[$arch]
        $unpackedDir = Join-Path $winBuildDir $info.unpacked
        $manifestSrc = Join-Path $winResourcesDir $info.manifest

        if (-not (Test-Path $unpackedDir)) {
            Write-Warn "$arch unpacked ディレクトリが見つかりません: $unpackedDir"
            continue
        }

        $assetsDir = Join-Path $unpackedDir "Assets"
        New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
        Copy-Item (Join-Path $winResourcesDir "Square150x150Logo.png") $assetsDir -Force
        Copy-Item (Join-Path $winResourcesDir "Square310x310.png") $assetsDir -Force
        Copy-Item (Join-Path $winResourcesDir "StoreLogo.png") $assetsDir -Force

        $manifestContent = Get-Content $manifestSrc -Raw -Encoding UTF8
        $manifestContent = $manifestContent -creplace '(<Identity[^>]*\sVersion=")[0-9.]+(")', "`${1}${msixVersion}`${2}"
        $manifestDest = Join-Path $unpackedDir "AppxManifest.xml"
        [System.IO.File]::WriteAllText($manifestDest, $manifestContent, [System.Text.UTF8Encoding]::new($false))

        $makepri = $makeappx -replace "makeappx\.exe", "makepri.exe"
        if (Test-Path $makepri) {
            $priConfig = Join-Path $unpackedDir "priconfig.xml"
            & $makepri createconfig /cf $priConfig /dq en-US /o 2>$null
            if (Test-Path $priConfig) {
                & $makepri new /pr $unpackedDir /cf $priConfig /mn $manifestDest /of (Join-Path $unpackedDir "resources.pri") /o 2>$null
                Remove-Item $priConfig -Force -ErrorAction SilentlyContinue
            }
        }

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

    if ($msixFiles.Count -gt 0) {
        Write-Host "  Creating MSIX Bundle ..." -ForegroundColor Gray
        $bundlePath = Join-Path $msixOutputDir "${DISPLAY_NAME}.msixbundle"
        $bundleDir = Join-Path $winBuildDir "msix-bundle-tmp"
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

Write-Step "manifest.json"

$manifestPath = Join-Path $DIST_DIR "manifest.json"
$manifest = @{}
if (Test-Path $manifestPath) {
    $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json -AsHashtable
}
$manifest["win_version"] = $version
$manifest | ConvertTo-Json -Compress | Set-Content -Path $manifestPath -NoNewline
Write-Ok "manifest.json を更新しました (win_version: $version)"

Send-FtpFile -LocalFile $manifestPath -RemotePath "path-converter/manifest.json"

if (-not $Noverup) {
    Write-Step "Version Update"
    Save-NextAppVersion -Version $version -VersionFile $versionFile
}

Write-Step "Build Complete - v$version"
Write-Host ""
Write-Host '  Output: windows\build\msix\' -ForegroundColor Gray
Write-Host ""
