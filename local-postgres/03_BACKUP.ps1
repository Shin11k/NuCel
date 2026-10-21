param([string]$Destination = 'C:\NuCelBackups')

$ErrorActionPreference = 'Stop'
$Root = Split-Path $PSScriptRoot -Parent
$EnvFile = Join-Path $Root '.env.local'
if (-not (Test-Path $EnvFile)) { throw 'Arquivo .env.local nao encontrado.' }

$settings = @{}
foreach ($line in Get-Content -LiteralPath $EnvFile -Encoding UTF8) {
  $trimmed = $line.Trim()
  if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
  $idx = $trimmed.IndexOf('=')
  if ($idx -lt 1) { continue }
  $key = $trimmed.Substring(0, $idx).Trim()
  $value = $trimmed.Substring($idx + 1).Trim().Trim('"').Trim("'")
  $settings[$key] = $value
}
if (-not $settings['NUCEL_PG_PASSWORD']) { throw 'NUCEL_PG_PASSWORD ausente.' }

$pgDump = Get-Command pg_dump.exe -ErrorAction SilentlyContinue
if ($pgDump) {
  $program = $pgDump.Source
} else {
  $program = Get-ChildItem 'C:\Program Files\PostgreSQL' -Directory -ErrorAction SilentlyContinue |
    Sort-Object { [int]($_.Name -replace '\D','') } -Descending |
    ForEach-Object { Join-Path $_.FullName 'bin\pg_dump.exe' } |
    Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $program) { throw 'pg_dump.exe nao encontrado. Instale Command Line Tools do PostgreSQL.' }

New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$final = Join-Path $Destination ('nucel-' + $stamp + '.dump')
$port = if ($settings['NUCEL_PG_PORT']) { $settings['NUCEL_PG_PORT'] } else { '5432' }
$user = if ($settings['NUCEL_PG_USER']) { $settings['NUCEL_PG_USER'] } else { 'nucel_app' }
$db = if ($settings['NUCEL_PG_DB']) { $settings['NUCEL_PG_DB'] } else { 'nucel_db' }
$env:PGPASSWORD = $settings['NUCEL_PG_PASSWORD']
try {
  & $program -h 127.0.0.1 -p $port -U $user -d $db -Fc -f $final
  if ($LASTEXITCODE -ne 0) { throw ('pg_dump falhou, codigo ' + $LASTEXITCODE) }
  if ((Get-Item -LiteralPath $final).Length -lt 100) { throw 'Backup vazio ou incompleto.' }
  Write-Host ('[OK] Backup criado: ' + $final) -ForegroundColor Green
  Write-Host '[IMPORTANTE] Copie o backup para fora do PC servidor e teste restauracao.' -ForegroundColor Yellow
} catch {
  Remove-Item -LiteralPath $final -Force -ErrorAction SilentlyContinue
  throw
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
