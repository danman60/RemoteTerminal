@echo off
echo ================================================================
echo        Remote Terminal Sync - Complete Service Startup
echo ================================================================
echo.

REM Change to the script directory
cd /d "%~dp0"

echo [1/4] Killing existing processes...
echo.

REM Kill all HostService processes
taskkill /F /IM "HostService.exe" 2>nul >nul
if %errorlevel% equ 0 (
    echo ✓ Killed existing HostService.exe processes
) else (
    echo ℹ No HostService.exe processes found
)

REM Kill all Node.js processes (websocket-proxy)
taskkill /F /IM "node.exe" 2>nul >nul
if %errorlevel% equ 0 (
    echo ✓ Killed existing Node.js processes
) else (
    echo ℹ No Node.js processes found
)

REM Kill any dotnet processes from previous runs
wmic process where "commandline like '%%HostService%%'" delete 2>nul >nul

REM Wait for processes to fully terminate
echo ⏳ Waiting for processes to terminate...
timeout /t 3 /nobreak >nul

echo.
echo [2/4] Building and starting Host Service (Windows Terminal Backend)...
echo.

REM Navigate to Host Service directory
cd "host-windows\src\HostService"

REM Clean build to avoid file locking issues
echo 🔨 Cleaning previous build...
dotnet clean >nul 2>&1

echo 🔨 Building Host Service...
dotnet build
if %errorlevel% neq 0 (
    echo ❌ Host Service build failed!
    pause
    exit /b 1
)

echo 🚀 Starting Host Service on localhost:8080...
start "Host Service" cmd /c "dotnet run && pause"

REM Wait for Host Service to start
timeout /t 5 /nobreak >nul

echo.
echo [3/4] Starting WebSocket Proxy (Port 8082 → 8081)...
echo.

REM Navigate back to root
cd /d "%~dp0"

REM Start WebSocket proxy
echo 🚀 Starting WebSocket Proxy on 0.0.0.0:8082...
start "WebSocket Proxy" cmd /c "node websocket-proxy.js && pause"

REM Wait for proxy to start
timeout /t 3 /nobreak >nul

echo.
echo [4/4] Testing connections...
echo.

REM Test if services are responding
echo 🔍 Testing Host Service (port 8080)...
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:8080' -TimeoutSec 5 -ErrorAction Stop; Write-Host '✓ Host Service responding' } catch { Write-Host '⚠ Host Service not responding yet' }"

echo 🔍 Testing WebSocket Proxy (port 8082)...
powershell -Command "try { $response = Invoke-WebRequest -Uri 'http://localhost:8082' -TimeoutSec 5 -ErrorAction Stop; Write-Host '✓ WebSocket Proxy responding' } catch { Write-Host '⚠ WebSocket Proxy not responding yet' }"

echo.
echo ================================================================
echo                       SERVICE STATUS
echo ================================================================
echo.
echo Host Service:     Running on localhost:8080 (Windows Terminal Backend)
echo WebSocket Proxy:  Running on 0.0.0.0:8082 (Internet-facing proxy)
echo.
echo ANDROID APP CONNECTION:
echo Connect to: ws://107.179.180.231:8082
echo.
echo To stop all services: run stop-all-services.bat
echo.
echo ================================================================

REM Keep window open
echo Press any key to close this window...
pause >nul