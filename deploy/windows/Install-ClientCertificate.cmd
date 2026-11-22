@echo off
setlocal
if "%~1"=="" goto usage
if "%~2"=="" goto usage
PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-ClientCertificate.ps1" -CertificateFile "%~1" -ExpectedDnsName "%~2"
set "RC=%ERRORLEVEL%"
if not "%RC%"=="0" pause
exit /b %RC%
:usage
echo Usage: Install-ClientCertificate.cmd "C:\path\NIPCO-Control.cer" "nipco-srv.company.local"
exit /b 2
