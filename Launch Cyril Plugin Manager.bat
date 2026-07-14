@echo off
setlocal

REM Launches Cyril Plugin Manager from Explorer without typing commands.
cd /d "%~dp0"

REM Installs Node dependencies only when they are missing.
if not exist "node_modules" (
  call npm install
  if errorlevel 1 exit /b 1
)

REM Starts the Electron app through the project launcher.
call npm start
