@echo off
echo ================================================================
echo        Remote Terminal Sync - Stop All Services
echo ================================================================
echo.

echo 🛑 Stopping all Remote Terminal services...
echo.

REM Kill all HostService processes
taskkill /F /IM "HostService.exe" 2>nul >nul
if %errorlevel% equ 0 (
    echo ✓ Stopped HostService.exe
) else (
    echo ℹ No HostService.exe processes found
)

REM Kill all Node.js processes (websocket-proxy)
taskkill /F /IM "node.exe" 2>nul >nul
if %errorlevel% equ 0 (
    echo ✓ Stopped Node.js processes (WebSocket Proxy)
) else (
    echo ℹ No Node.js processes found
)

REM Kill any dotnet processes from HostService
wmic process where "commandline like '%%HostService%%'" delete 2>nul >nul

REM Kill any background processes from our project
wmic process where "commandline like '%%remote-terminal-sync%%'" delete 2>nul >nul

echo.
echo ✅ All Remote Terminal services stopped.
echo.
echo To restart services: run start-all-services.bat
echo.

pause