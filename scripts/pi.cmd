@echo off
setlocal EnableDelayedExpansion
REM Sync stack PRIMA che Pi carichi models.json, poi avvia il CLI globale (no wrapper loop).
cd /d "%~dp0.."

if errorlevel 1 (
)
set PI_STACK_PRE_SYNCED=1

set "PI_CLI="
for /f "usebackq delims=" %%C in (`node "%~dp0resolve-pi-cli.mjs" 2^>nul`) do set "PI_CLI=%%C"

if defined PI_CLI (
  node "!PI_CLI!" %*
  exit /b !ERRORLEVEL!
)

REM Fallback: primo `pi` in PATH che NON sia il wrapper locale ~/.pi/agent/pi.cmd
set "PI_EXE="
for /f "usebackq delims=" %%P in (`where pi 2^>nul`) do (
  echo %%P | findstr /i /c:"\.pi\agent\pi.cmd" >nul
  if errorlevel 1 if not defined PI_EXE set "PI_EXE=%%P"
)
if defined PI_EXE (
  call "!PI_EXE!" %*
  exit /b !ERRORLEVEL!
)

echo   Installa: npm i -g @earendil-works/pi-coding-agent
echo   Poi rilancia: scripts\pi.cmd
exit /b 1