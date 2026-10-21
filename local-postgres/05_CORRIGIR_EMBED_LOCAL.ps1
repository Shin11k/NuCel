param(
    [Parameter(Mandatory=$true)]
    [string]$EngineConfigPath
)

$ErrorActionPreference = 'Stop'

try {
    $path = [IO.Path]::GetFullPath($EngineConfigPath)
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Arquivo nao encontrado: $path"
    }

    $config = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -eq $config.frameAncestors) {
        throw 'A configuracao do ENGINE nao contem frameAncestors.'
    }
    if ($config.webPort -ne 8000) {
        throw 'A configuracao selecionada nao pertence ao ENGINE da porta 8000.'
    }

    $origins = @(
        'http://127.0.0.1:3001',
        'http://localhost:3001'
    )
    $allowed = @($config.frameAncestors)
    foreach ($origin in $origins) {
        if ($allowed -notcontains $origin) {
            $allowed += $origin
        }
    }

    $config.frameAncestors = $allowed
    $backup = $path + '.backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Copy-Item -LiteralPath $path -Destination $backup -ErrorAction Stop

    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $json = $config | ConvertTo-Json -Depth 15
    [IO.File]::WriteAllText($path, $json + [Environment]::NewLine, $utf8)

    Write-Host '[OK] O ENGINE pode ser incorporado no painel local da porta 3001.' -ForegroundColor Green
    Write-Host ('Configuracao: ' + $path) -ForegroundColor Gray
    Write-Host ('Backup: ' + $backup) -ForegroundColor DarkGray
    Write-Host 'REINICIE apenas o ENGINE (porta 8000) para a configuracao ser aplicada.' -ForegroundColor Yellow
    exit 0
}
catch {
    Write-Host ('[ERRO] ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
