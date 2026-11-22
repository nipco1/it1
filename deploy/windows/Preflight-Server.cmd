@echo off
setlocal
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Test-Readiness.ps1" -Mode Server %*
set "RC=%ERRORLEVEL%"
pause
exit /b %RC%
