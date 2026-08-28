@echo off
cd /d "%~dp0.."
node scripts\install-podman-windows.mjs
exit /b %ERRORLEVEL%