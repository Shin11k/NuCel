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
        'http://localhost:3001',
        'https://nucel-vpc-teste.nuvixgestao.workers.dev',
        'https://nucel.nuvixgestao.workers.dev'
    )
    $allowed = @($config.frameAncestors)
    foreach ($origin in $origins) {
        if ($allowed -notcontains $origin) {
            $allowed += $origin
        }
    }

    $config.frameAncestors = $allowed
    if ($null -eq $config.allowedHosts) {
        throw 'A configuracao do ENGINE nao contem allowedHosts.'
    }
    $hosts = @($config.allowedHosts)
    foreach ($hostToAllow in @(
        'nucel-vpc-teste.nuvixgestao.workers.dev',
        'nucel.nuvixgestao.workers.dev'
    )) {
        if ($hosts -notcontains $hostToAllow) {
            $hosts += $hostToAllow
        }
    }
    $config.allowedHosts = $hosts
    $backup = $path + '.backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Copy-Item -LiteralPath $path -Destination $backup -ErrorAction Stop

    $utf8 = New-Object System.Text.UTF8Encoding($false)
    $json = $config | ConvertTo-Json -Depth 15
    [IO.File]::WriteAllText($path, $json + [Environment]::NewLine, $utf8)

    Write-Host '[OK] O ENGINE agora permite os dominios NuCel Cloudflare e o painel local.' -ForegroundColor Green
    Write-Host ('Configuracao: ' + $path) -ForegroundColor Gray
    Write-Host ('Backup: ' + $backup) -ForegroundColor DarkGray
    Write-Host 'REINICIE apenas o ENGINE (porta 8000) para a configuracao ser aplicada.' -ForegroundColor Yellow
    exit 0
}
catch {
    Write-Host ('[ERRO] ' + $_.Exception.Message) -ForegroundColor Red
    exit 1
}
