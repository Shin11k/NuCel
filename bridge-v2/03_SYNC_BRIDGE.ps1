param(
    [Parameter(Mandatory=$true)][string]$Url,
    [string]$BridgeName = 'PC Principal'
)

$ErrorActionPreference = 'Stop'
$BridgeDir = $PSScriptRoot
$Root = Split-Path $BridgeDir -Parent
$ConfigCandidates = @(
    (Join-Path $Root 'connector\config.json'),
    (Join-Path $BridgeDir 'bridge-auth.json')
)

$configPath = $null
foreach ($candidate in $ConfigCandidates) {
    if (Test-Path $candidate) {
        $configPath = $candidate
        break
    }
}

if (-not $configPath) {
    Write-Host '[ERRO] Chave local do NuCel nao encontrada.' -ForegroundColor Red
    Write-Host 'Esperado: connector\config.json ou bridge-v2\bridge-auth.json' -ForegroundColor Yellow
    exit 2
}

try {
    $config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
} catch {
    Write-Host ('[ERRO] Nao foi possivel ler ' + $configPath) -ForegroundColor Red
    exit 2
}

$secret = [string]$config.secret
if ([string]::IsNullOrWhiteSpace($secret) -or $secret -match 'COLE_A_CHAVE') {
    Write-Host '[ERRO] A chave local do conector nao esta configurada.' -ForegroundColor Red
    exit 2
}

try {
    $uri = [Uri]$Url
    if ($uri.Scheme -ne 'https' -or -not $uri.Host.EndsWith('.trycloudflare.com')) {
        throw 'URL invalida'
    }
    $origin = $uri.GetLeftPart([System.UriPartial]::Authority)
} catch {
    Write-Host '[ERRO] URL do tunnel invalida.' -ForegroundColor Red
    exit 3
}

$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$message = "$timestamp`n$BridgeName`n$origin"

$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [Text.Encoding]::UTF8.GetBytes($secret)
$hash = $hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($message))
$signature = -join ($hash | ForEach-Object { $_.ToString('x2') })
$hmac.Dispose()

$payload = @{
    bridgeName = $BridgeName
    url = $origin
    timestamp = $timestamp
    signature = $signature
} | ConvertTo-Json -Compress

try {
    $result = Invoke-RestMethod `
        -Method Post `
        -Uri 'https://nucel.nuvixgestao.workers.dev/api/bridge/sync' `
        -ContentType 'application/json' `
        -Body $payload `
        -TimeoutSec 15

    if (-not $result.ok) {
        throw 'Resposta sem confirmacao'
    }

    Write-Host ('[OK] NuCel sincronizado: ' + $origin) -ForegroundColor Green
    exit 0
}
catch {
    $syncError = $_
    Write-Host ('[ERRO] Falha ao sincronizar URL do tunnel: ' + $syncError.Exception.Message) -ForegroundColor Red

    # Mostra o codigo HTTP e a resposta da API sem expor a chave local.
    $response = $syncError.Exception.Response
    if ($null -ne $response) {
        try {
            Write-Host ('[HTTP] ' + [int]$response.StatusCode + ' ' + $response.StatusDescription) -ForegroundColor Yellow
        } catch {}

        $detail = $null
        try {
            $stream = $response.GetResponseStream()
            if ($null -ne $stream) {
                $reader = New-Object System.IO.StreamReader($stream)
                try {
                    $detail = $reader.ReadToEnd()
                } finally {
                    $reader.Dispose()
                }
            }
        } catch {
            Write-Host ('[AVISO] Nao foi possivel ler a resposta HTTP: ' + $_.Exception.Message) -ForegroundColor Yellow
        }

        # Alguns erros do PowerShell ja trazem o corpo da resposta em ErrorDetails.
        if ([string]::IsNullOrWhiteSpace($detail) -and $syncError.ErrorDetails) {
            $detail = $syncError.ErrorDetails.Message
        }

        if (-not [string]::IsNullOrWhiteSpace($detail)) {
            Write-Host ('[DETALHES DA API] ' + $detail) -ForegroundColor Yellow
        } else {
            Write-Host '[DETALHES DA API] O servidor nao enviou detalhes adicionais.' -ForegroundColor Yellow
        }
    } else {
        Write-Host '[DETALHES] Nao houve resposta HTTP. Verifique DNS, internet e acesso ao Worker.' -ForegroundColor Yellow
    }

    Write-Host '[INFO] Nenhuma chave ou assinatura local foi exibida no diagnostico.' -ForegroundColor DarkGray
    exit 4
}
