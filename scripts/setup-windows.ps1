#Requires -Version 5.1
# scripts/setup-windows.ps1
# Radium - Windows Development Environment Setup
# Installs: Rust, nvm-windows, Node.js 20, uv, Python 3.12, jq, Pillow, Yarn
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts/setup-windows.ps1
#   - or -
#   make setup-windows

$ErrorActionPreference = 'Continue'

function Write-ConsoleLine {
    # Interactive setup output; writes straight to the host UI with optional colour.
    param(
        [Parameter(Position = 0)][string]$Message = '',
        [Nullable[System.ConsoleColor]]$ForegroundColor = $null
    )
    if ($null -eq $ForegroundColor) {
        $Host.UI.WriteLine($Message)
    } else {
        $Host.UI.WriteLine($ForegroundColor, $Host.UI.RawUI.BackgroundColor, $Message)
    }
}

function Write-Step {
    param([string]$msg)
    Write-ConsoleLine ''
    Write-ConsoleLine '========================================' -ForegroundColor Cyan
    Write-ConsoleLine "  $msg" -ForegroundColor Cyan
    Write-ConsoleLine '========================================' -ForegroundColor Cyan
}

function Write-OK {
    param([string]$msg)
    Write-ConsoleLine "  [OK] $msg" -ForegroundColor Green
}

function Write-Warn {
    param([string]$msg)
    Write-ConsoleLine "  [!!] $msg" -ForegroundColor Yellow
}

function Write-Fail {
    param([string]$msg)
    Write-ConsoleLine "  [FAIL] $msg" -ForegroundColor Red
}

function Test-Cmd {
    param([string]$cmd)
    $result = Get-Command $cmd -ErrorAction SilentlyContinue 2>$null
    return ($null -ne $result)
}

function Update-SessionPath {
    $machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = $machinePath + ';' + $userPath
}

$restartRequired = $false

# -- Git -----------------------------------------------------------
Write-Step 'Git'
if (Test-Cmd 'git') {
    $gitVer = (git --version 2>&1) | Out-String
    Write-OK $gitVer.Trim()
} else {
    Write-ConsoleLine '  Installing Git...'
    winget install --id Git.Git -e --accept-source-agreements --accept-package-agreements
    Update-SessionPath
    $restartRequired = $true
}

# -- Visual Studio Build Tools (C++ for Rust) ---------------------
Write-Step 'Visual Studio Build Tools (C++ workload)'
$vsWherePath = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$hasCpp = $false
if (Test-Path $vsWherePath) {
    $vsPath = (& $vsWherePath -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null) | Out-String
    $vsPath = $vsPath.Trim()
    if ($vsPath) { $hasCpp = $true }
}
if ($hasCpp) {
    Write-OK "C++ build tools found at $vsPath"
} else {
    Write-ConsoleLine '  Installing Visual Studio 2022 Build Tools with C++ workload...'
    Write-ConsoleLine '  (this can take 5-15 minutes on first install)' -ForegroundColor DarkGray
    winget install --id Microsoft.VisualStudio.2022.BuildTools -e `
        --accept-source-agreements --accept-package-agreements `
        --override '--wait --passive --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended'
    $restartRequired = $true
}

# -- Rust ----------------------------------------------------------
Write-Step 'Rust (rustup + stable toolchain)'
if (Test-Cmd 'rustup') {
    Write-OK 'rustup found - updating stable toolchain'
    rustup update stable 2>&1 | Out-Null
    $rustcVer = (rustc --version 2>&1) | Out-String
    Write-OK $rustcVer.Trim()
} else {
    Write-ConsoleLine '  Downloading rustup-init.exe...'
    $rustupInit = Join-Path $env:TEMP 'rustup-init.exe'
    Invoke-WebRequest -Uri 'https://win.rustup.rs/x86_64' -OutFile $rustupInit -UseBasicParsing
    Write-ConsoleLine '  Running rustup-init (default stable toolchain)...'
    & $rustupInit -y --default-toolchain stable
    Remove-Item $rustupInit -Force -ErrorAction SilentlyContinue
    $cargoPath = Join-Path $env:USERPROFILE '.cargo\bin'
    $env:Path = $cargoPath + ';' + $env:Path
    Update-SessionPath
    $restartRequired = $true
    Write-OK 'Rust installed'
}

# -- uv (Python/package manager) ----------------------------------
Write-Step 'uv (Python & package manager from Astral)'
if (Test-Cmd 'uv') {
    $uvVer = (uv --version 2>&1) | Out-String
    Write-OK $uvVer.Trim()
} else {
    Write-ConsoleLine '  Installing uv via winget...'
    winget install --id astral-sh.uv -e --accept-source-agreements --accept-package-agreements
    Update-SessionPath
    # Also add the default uv bin path
    $uvBinPath = Join-Path $env:USERPROFILE '.local\bin'
    if (Test-Path $uvBinPath) {
        $env:Path = $uvBinPath + ';' + $env:Path
    }
    $uvCargoPath = Join-Path $env:USERPROFILE '.cargo\bin'
    if (Test-Path $uvCargoPath) {
        $env:Path = $uvCargoPath + ';' + $env:Path
    }
    if (Test-Cmd 'uv') {
        Write-OK 'uv installed'
    } else {
        $restartRequired = $true
        Write-Warn 'uv installed but not yet on PATH. Restart terminal.'
    }
}

# -- Python 3.12 via uv -------------------------------------------
Write-Step 'Python 3.12 (via uv)'
if (Test-Cmd 'uv') {
    Write-ConsoleLine '  Installing Python 3.12 via uv...'
    uv python install 3.12 2>&1 | ForEach-Object { Write-ConsoleLine "  $_" }
    Write-OK 'Python 3.12 managed by uv'
} else {
    Write-Warn 'uv not available yet. Python will be installed after terminal restart.'
    $restartRequired = $true
}

# -- Pillow (for icon generation) via uv --------------------------
Write-Step 'Pillow (Python package for icon generation)'
if (Test-Cmd 'uv') {
    Write-ConsoleLine '  Installing Pillow via uv...'
    uv pip install --system Pillow 2>&1 | ForEach-Object { Write-ConsoleLine "  $_" }
    if ($LASTEXITCODE -ne 0) {
        Write-ConsoleLine '  Trying with uv tool install...'
        uv pip install Pillow --python 3.12 2>&1 | ForEach-Object { Write-ConsoleLine "  $_" }
    }
    Write-OK 'Pillow installed'
} else {
    Write-Warn 'uv not available yet. After restart run: uv pip install --system Pillow'
}

# -- jq ------------------------------------------------------------
Write-Step 'jq (JSON processor)'
if (Test-Cmd 'jq') {
    $jqVer = (jq --version 2>&1) | Out-String
    Write-OK $jqVer.Trim()
} else {
    Write-ConsoleLine '  Installing jq via winget...'
    winget install --id jqlang.jq -e --accept-source-agreements --accept-package-agreements
    Update-SessionPath
    $restartRequired = $true
}

# -- nvm-windows ---------------------------------------------------
Write-Step 'nvm-windows (Node Version Manager)'
if (Test-Cmd 'nvm') {
    Write-OK 'nvm-windows is already installed'
} else {
    Write-ConsoleLine '  Installing nvm-windows via winget...'
    winget install --id CoreyButler.NVMforWindows -e `
        --accept-source-agreements --accept-package-agreements
    Update-SessionPath
    $restartRequired = $true
}

# Ensure NVM_HOME and NVM_SYMLINK are set in current session
$nvmHome = [System.Environment]::GetEnvironmentVariable('NVM_HOME', 'User')
if (-not $nvmHome) {
    $nvmHome = [System.Environment]::GetEnvironmentVariable('NVM_HOME', 'Machine')
}
if (-not $nvmHome) {
    $nvmHome = Join-Path $env:APPDATA 'nvm'
}
$env:NVM_HOME = $nvmHome

$nvmSymlink = [System.Environment]::GetEnvironmentVariable('NVM_SYMLINK', 'User')
if (-not $nvmSymlink) {
    $nvmSymlink = [System.Environment]::GetEnvironmentVariable('NVM_SYMLINK', 'Machine')
}
if (-not $nvmSymlink) {
    $nvmSymlink = Join-Path $env:ProgramFiles 'nodejs'
}
$env:NVM_SYMLINK = $nvmSymlink

# Add nvm paths to current session
if (Test-Path $nvmHome) {
    if ($env:Path -notlike "*$nvmHome*") {
        $env:Path = $nvmHome + ';' + $env:Path
    }
}
if ($env:Path -notlike "*$nvmSymlink*") {
    $env:Path = $nvmSymlink + ';' + $env:Path
}

# Ensure settings.txt exists (nvm-windows crashes without it)
if (Test-Path $nvmHome) {
    $settingsFile = Join-Path $nvmHome 'settings.txt'
    if (-not (Test-Path $settingsFile)) {
        Write-ConsoleLine "  Creating nvm settings.txt at $settingsFile"
        $settingsContent = "root: $nvmHome`r`npath: $nvmSymlink"
        [System.IO.File]::WriteAllText($settingsFile, $settingsContent)
    }
}

# -- Node.js 20 ----------------------------------------------------
Write-Step 'Node.js 20'
if (Test-Cmd 'nvm') {
    $nvmList = (nvm list 2>&1) | Out-String
    if ($nvmList -match '20\.') {
        Write-OK 'Node.js 20 already installed via nvm'
    } else {
        Write-ConsoleLine '  Installing Node.js 20 via nvm...'
        nvm install 20
    }
    Write-ConsoleLine '  Activating Node.js 20...'
    nvm use 20
    Update-SessionPath
} elseif (Test-Cmd 'node') {
    $ver = (node --version 2>&1) | Out-String
    Write-OK "Node.js available (not via nvm): $($ver.Trim())"
} else {
    Write-Warn 'nvm not yet available in this session.'
    Write-Warn 'After restart run: nvm install 20 && nvm use 20'
    $restartRequired = $true
}

# -- Yarn via corepack ---------------------------------------------
Write-Step 'Yarn 4.5.3 (via corepack)'
if (Test-Cmd 'corepack') {
    corepack enable 2>&1 | Out-Null
    corepack prepare yarn@4.5.3 --activate 2>&1 | Out-Null
    Write-OK 'Yarn 4.5.3 activated via corepack'
    if (Test-Cmd 'yarn') {
        yarn config set -H enableImmutableInstalls false 2>&1 | Out-Null
    }
} elseif (Test-Cmd 'node') {
    Write-ConsoleLine '  Enabling corepack...'
    corepack enable 2>&1 | Out-Null
    corepack prepare yarn@4.5.3 --activate 2>&1 | Out-Null
    Write-OK 'Yarn 4.5.3 activated'
    if (Test-Cmd 'yarn') {
        yarn config set -H enableImmutableInstalls false 2>&1 | Out-Null
    }
} else {
    Write-Warn 'corepack requires Node.js. Will be configured after nvm + node install.'
}

# -- Summary -------------------------------------------------------
Write-ConsoleLine ''
Write-ConsoleLine '========================================' -ForegroundColor Green
Write-ConsoleLine '  SETUP COMPLETE' -ForegroundColor Green
Write-ConsoleLine '========================================' -ForegroundColor Green

if ($restartRequired) {
    Write-ConsoleLine ''
    Write-Warn 'Some tools were freshly installed.'
    Write-Warn 'RESTART YOUR TERMINAL, then run this script again to finish Node.js + Yarn setup.'
    Write-ConsoleLine ''
    Write-ConsoleLine '  After restart:' -ForegroundColor White
    Write-ConsoleLine '    1. make setup-windows       (to finish nvm/node/yarn setup)' -ForegroundColor White
    Write-ConsoleLine '    2. make dev-windows          (to build and run)' -ForegroundColor White
} else {
    Write-ConsoleLine ''
    Write-ConsoleLine '  Everything is ready! Run:' -ForegroundColor White
    Write-ConsoleLine '    make dev-windows' -ForegroundColor White
}
Write-ConsoleLine ''
