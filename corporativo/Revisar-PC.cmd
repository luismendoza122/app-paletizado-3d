@echo off
rem Revisa este PC (PowerShell, politicas de TI, navegadores, proxy y acceso a la nube) y deja un informe.
cd /d "%~dp0"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0nucleo\Revisar-PC.ps1"
pause
