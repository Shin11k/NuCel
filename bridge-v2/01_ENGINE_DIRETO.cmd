@echo off
setlocal EnableExtensions
title 1 - NUCEL ENGINE
cd /d "%~dp0"

set "ROOT=%CD%"
set "ENGINE=%ROOT%\.engine\ws-scrcpy-web"
set "CONFIG=%ROOT%\engine-config.json"
set "LAB=%ROOT%\nucel-direct.html"

if not exist "%ENGINE%\package.json" (
  echo [ERRO] Motor nao encontrado. Rode 01_INICIAR_LOCAL.cmd uma vez.
  pause
  exit /b 1
)

if exist "C:\Program Files\nodejs\node.exe" set "PATH=C:\Program Files\nodejs;%PATH%"

for /f "tokens=5" %%P in ('netstat -ano ^| findstr LISTENING ^| findstr ":8000"') do (
  echo.
  echo [ERRO] A porta 8000 ja esta em uso pelo PID %%P.
  echo Feche o ENGINE antigo antes de iniciar outro.
  echo O NuCel precisa obrigatoriamente usar a porta 8000.
  echo.
  pause
  exit /b 1
)

set "WS_SCRCPY_CONFIG=%CONFIG%"
set "WS_SCRCPY_NO_BROWSER=1"
cd /d "%ENGINE%"

echo.
echo ===============================================
echo       NuCel ENGINE - DIRECT API
echo ===============================================
echo.
echo [1/3] Preparando dependencias...
call npm run stage-seed
if errorlevel 1 goto :fail

echo [2/3] Aplicando correcao de toque...
node "%ROOT%\patch-engine-touch.mjs"
if errorlevel 1 goto :fail

echo [2/3] Preparando HTTPS do Cloudflare Tunnel...
node "%ROOT%\patch-engine-cloudflare-https.mjs"
if errorlevel 1 goto :fail

echo [2/3] Aplicando qualidade HD do NuCel...
node "%ROOT%\patch-engine-quality.mjs"
if errorlevel 1 goto :fail

echo [2/3] Adicionando transferencia de texto entre celulares...
node "%ROOT%\patch-engine-clipboard.mjs"
if errorlevel 1 goto :fail

echo [2/3] Compilando motor...
call npm run build
if errorlevel 1 goto :fail

echo [3/3] Instalando NuCel Direct Lab...
copy /Y "%LAB%" "%ENGINE%\dist\public\nucel-direct.html" >nul
if errorlevel 1 goto :fail

echo.
echo [OK] Motor pronto.
echo Abra: http://localhost:8000/nucel-direct.html
echo.
node scripts/dev-supervisor.mjs
exit /b %errorlevel%

:fail
echo.
echo [ERRO] Falha ao iniciar o NuCel Direct Engine.
pause
exit /b 1
