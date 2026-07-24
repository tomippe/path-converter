#Requires -Version 5.1
<#
  electron-builder をローカルディスクで実行する（UNC / ネットワークドライブ対策）。
  成果物は windows/build/ に出力する。
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectDir,
    [ValidateSet('x64', 'arm64')]
    [string]$Arch = 'x64',
    [string]$OutputRelative = 'windows/build'
)

$ErrorActionPreference = 'Stop'

function Test-UncPath([string]$Path) {
    $root = [System.IO.Path]::GetPathRoot($Path)
    if ($root -match '^\\\\') { return $true }
    try {
        $name = $root.TrimEnd('\').TrimEnd(':')
        if (-not $name) { return $false }
        $drive = Get-PSDrive -Name $name -ErrorAction SilentlyContinue
        return ($drive -and $drive.DisplayRoot -like '\\*')
    } catch {
        return $false
    }
}

$npmScript = if ($Arch -eq 'arm64') { 'build:win-arm64' } else { 'build:win-x64' }
$localRoot = Join-Path $env:LOCALAPPDATA 'path-converter-win-electron-build'
$isUnc = Test-UncPath $ProjectDir
$outDest = Join-Path $ProjectDir ($OutputRelative -replace '/', '\')

if (-not $isUnc) {
    Write-Host "  electron-builder $Arch (local project path)..." -ForegroundColor Gray
    Push-Location $ProjectDir
    try {
        npm run $npmScript
        if ($LASTEXITCODE -ne 0) { throw "electron-builder failed ($Arch)" }
    } finally {
        Pop-Location
    }
    exit 0
}

Write-Host "  electron-builder $Arch (local staging: $localRoot)..." -ForegroundColor Gray

Remove-Item -LiteralPath $localRoot -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $localRoot -Force | Out-Null

robocopy $ProjectDir $localRoot /MIR /XD "mac\build" node_modules "windows\build" /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy project -> local failed" }

$nodeModules = Join-Path $ProjectDir 'node_modules'
if (Test-Path -LiteralPath $nodeModules) {
    robocopy $nodeModules (Join-Path $localRoot 'node_modules') /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy node_modules failed" }
}

Push-Location $localRoot
try {
    cmd /c "npm install --force --no-audit --no-fund 2>nul"
} finally {
    Pop-Location
}

Push-Location $localRoot
try {
    npm run $npmScript
    if ($LASTEXITCODE -ne 0) { throw "electron-builder failed ($Arch)" }
} finally {
    Pop-Location
}

$outSrc = Join-Path $localRoot ($OutputRelative -replace '/', '\')
if (-not (Test-Path -LiteralPath $outSrc)) { throw "local $OutputRelative not produced" }

New-Item -ItemType Directory -Path $outDest -Force | Out-Null
robocopy $outSrc $outDest /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
if ($LASTEXITCODE -ge 8) {
    throw "robocopy $OutputRelative -> project failed; see $outSrc"
}
