param(
    [string]$BridgeDir = 'C:\Users\pitan\Downloads\scrcpy-win64-v4.1\scrcpy-win64-v4.1\NuCel\bridge-v2'
)
$ErrorActionPreference = 'Stop'
$sourceDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'bridge-v2'
$destination = [IO.Path]::GetFullPath($BridgeDir)
$engine = Join-Path $destination '.engine\ws-scrcpy-web\package.json'
$cmdPath = Join-Path $destination '01_ENGINE_DIRETO.cmd'

if (!(Test-Path $engine -PathType Leaf)) { throw "Motor nao encontrado no caminho selecionado: $engine" }
if (!(Test-Path $cmdPath -PathType Leaf)) { throw "Script de inicializacao nao encontrado: $cmdPath" }

$original = Get-Content -LiteralPath $cmdPath -Raw -Encoding UTF8
$marker = 'echo [2/3] Compilando motor...'
$installMarker = 'node "%ROOT%\patch-engine-clipboard.mjs"'
if (!$original.Contains($installMarker) -and !$original.Contains($marker)) {
    throw 'Inicializador ENGINE diferente do esperado. Nenhum arquivo foi modificado.'
}

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
foreach ($name in @('01_ENGINE_DIRETO.cmd', 'nucel-direct.html')) {
    $dest = Join-Path $destination $name
    if (Test-Path $dest -PathType Leaf) {
        Copy-Item -LiteralPath $dest -Destination ($dest + '.before-clipboard-' + $stamp)
    }
}

foreach ($name in @('patch-engine-clipboard.mjs', 'nucel-direct.html')) {
    $from = Join-Path $sourceDir $name
    if (!(Test-Path $from -PathType Leaf)) { throw "Codigo fonte ausente: $from" }
    Copy-Item -LiteralPath $from -Destination (Join-Path $destination $name) -Force
}

if (!$original.Contains($installMarker)) {
    $block = @'
echo [2/3] Adicionando transferencia de texto entre celulares...
node "%ROOT%\patch-engine-clipboard.mjs"
if errorlevel 1 goto :fail

'@
    $updated = $original.Replace($marker, $block + $marker)
    [IO.File]::WriteAllText($cmdPath, $updated, [Text.Encoding]::Default)
}
Write-Host '[OK] Funcao de transferencia instalada no ENGINE antigo (sem trocar branches).' -ForegroundColor Green
Write-Host ('Diretorio: ' + $destination) -ForegroundColor Gray
Write-Host ('Backups com sufixo before-clipboard-' + $stamp) -ForegroundColor DarkGray
Write-Host 'REINICIE apenas o ENGINE; ele aplicara o patch e recompilara automaticamente.' -ForegroundColor Yellow
