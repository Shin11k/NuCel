@echo off
setlocal EnableExtensions
title NuCel - TESTE PostgreSQL local
cd /d "%~dp0.."

echo.
echo ==============================================
echo        NUCEL / POSTGRESQL LOCAL / TESTE
echo ==============================================
echo.
echo Este teste usa http://127.0.0.1:3001
echo Nao muda nem inicia a versao antiga em producao.
echo.

if not exist ".env.local" (
  echo [ERRO] Falta .env.local na pasta NuCel-Postgres-Test.
  echo Veja local-postgres\CONFIG_EXEMPLO.txt
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [1/3] Instalando dependencias...
  call npm install
  if errorlevel 1 goto :fail
)

echo [2/3] Conferindo PostgreSQL...
call npm run local:doctor
if errorlevel 1 goto :fail

echo [3/3] Iniciando painel em http://127.0.0.1:3001
echo.
echo Teste em seu navegador. Ctrl+C encerra o TESTE.
call npm run dev -- -H 127.0.0.1 -p 3001
exit /b %errorlevel%

:fail
echo.
echo [ERRO] Corrija a mensagem acima antes de prosseguir.
pause
exit /b 1
