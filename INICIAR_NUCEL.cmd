@echo off
setlocal EnableExtensions
chcp 65001 >nul
title NUCEL - Iniciar servidores
color 0B

REM ATALHO DE 1 CLIQUE DO NUCEL - PC SERVIDOR
REM Inicia ENGINE :8000 e PAINEL :3001 apenas se ainda nao estiverem ligados.
REM Nao abre o navegador e nao altera banco de dados nem Cloudflare.

set "ENGINE_DIR=C:\Users\pitan\Downloads\scrcpy-win64-v4.1\scrcpy-win64-v4.1\NuCel\bridge-v2"
set "PANEL_DIR=C:\Users\pitan\Downloads\NuCel-Postgres-Test"

cls
echo =============================================
echo          NUCEL - INICIAR SERVIDORES
echo =============================================
echo.

if not exist "%ENGINE_DIR%\01_ENGINE_DIRETO.cmd" (
  echo [ERRO] Nao encontrei o ENGINE:
  echo %ENGINE_DIR%\01_ENGINE_DIRETO.cmd
  echo.
  pause
  exit /b 1
)
if not exist "%PANEL_DIR%\package.json" (
  echo [ERRO] Nao encontrei a pasta do painel:
  echo %PANEL_DIR%
  echo.
  pause
  exit /b 1
)

call :CheckPort 8000
if errorlevel 1 (
  echo [INICIANDO] ENGINE - porta 8000
  start "NuCel ENGINE - 8000" /MIN /D "%ENGINE_DIR%" "%ComSpec%" /k call 01_ENGINE_DIRETO.cmd
) else (
  echo [OK] ENGINE - porta 8000 ja esta ocupada; nao iniciarei outro.
)

echo.
call :CheckPort 3001
if errorlevel 1 (
  echo [INICIANDO] PAINEL - porta 3001
  start "NuCel PAINEL - 3001" /MIN /D "%PANEL_DIR%" "%ComSpec%" /k npm.cmd run start:local
) else (
  echo [OK] PAINEL - porta 3001 ja esta ocupada; nao iniciarei outro.
)

echo.
echo =============================================
echo Pronto: inicializacao solicitada.
echo Os dois processos ficam em janelas minimizadas.
echo Aguarde a compilacao do ENGINE se necessario.
echo.
echo URL: https://nucel-vpc-teste.nuvixgestao.workers.dev/
echo.
echo Banco PostgreSQL e Cloudflare Tunnel dependem
echo dos servicos automaticos do Windows.
echo =============================================
echo.
timeout /t 7 /nobreak >nul
exit /b 0

:CheckPort
powershell.exe -NoProfile -Command "if (Get-NetTCPConnection -State Listen -LocalPort %~1 -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
exit /b %errorlevel%
