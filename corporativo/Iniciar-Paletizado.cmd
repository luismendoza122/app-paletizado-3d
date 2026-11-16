@echo off
rem Paletizado 3D - copia corporativa. Doble clic para abrir. No necesita administrador.
setlocal
title Paletizado 3D (corporativo)
cd /d "%~dp0"
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS%" set "PS=powershell.exe"
"%PS%" -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0Iniciar-Paletizado.ps1" %*
set "CODIGO=%ERRORLEVEL%"
if "%CODIGO%"=="0" goto fin
if "%CODIGO%"=="2" goto fin
if "%CODIGO%"=="3" goto fin
if "%CODIGO%"=="5" goto fin
if "%CODIGO%"=="6" goto fin
echo.
echo No se pudo iniciar con PowerShell en este PC (codigo %CODIGO%).
echo Se abre la version web oficial, que funciona igual.
start "" "https://luismendoza122.github.io/app-paletizado-3d/"
pause
:fin
endlocal
