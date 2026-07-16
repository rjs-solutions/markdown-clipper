param([string]$Version = "")

$ErrorActionPreference = "Stop"
$runtimeRoot = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies"
$node = Join-Path $runtimeRoot "node\bin\node.exe"
$pnpmStore = Join-Path $runtimeRoot "node\node_modules\.pnpm"
$playwrightPackage = Get-ChildItem $pnpmStore -Directory -Filter "playwright-core@*" |
  Sort-Object Name -Descending |
  Select-Object -First 1

if (-not (Test-Path $node) -or -not $playwrightPackage) {
  throw "The bundled Node/Playwright runtime was not found. Run from Codex or install Playwright Core locally."
}

$playwrightIndex = Join-Path $playwrightPackage.FullName "node_modules\playwright-core\index.mjs"
$env:MARKDOWN_CLIPPER_PLAYWRIGHT_CORE = ([Uri]$playwrightIndex).AbsoluteUri
$playwrightHome = Join-Path $env:LOCALAPPDATA "ms-playwright"

function Find-PlaywrightChrome {
  $browser = Get-ChildItem $playwrightHome -Directory -Filter "chromium-*" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
  if ($browser) {
    $candidate = Join-Path $browser.FullName "chrome-win64\chrome.exe"
    if (Test-Path $candidate) { return $candidate }
  }
  return ""
}

$playwrightChrome = Find-PlaywrightChrome
if (-not $playwrightChrome) {
  Write-Output "Installing the compatible Chromium runtime for automated extension capture..."
  $playwrightCli = Join-Path $playwrightPackage.FullName "node_modules\playwright-core\cli.js"
  & $node $playwrightCli install chromium
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  $playwrightChrome = Find-PlaywrightChrome
}

$installedChrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (Test-Path $playwrightChrome) {
  $env:MARKDOWN_CLIPPER_CHROME_EXE = $playwrightChrome
} elseif (Test-Path $installedChrome) {
  $env:MARKDOWN_CLIPPER_CHROME_EXE = $installedChrome
} else {
  throw "No compatible Chromium or Chrome executable was found."
}

$script = Join-Path $PSScriptRoot "capture-store-screenshots.mjs"
if ($Version) { & $node $script $Version } else { & $node $script }
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
