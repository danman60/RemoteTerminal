@echo off
echo Starting Remote Terminal Sync Services...

REM Kill any existing processes
taskkill /F /IM HostService.exe 2>nul
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo.
echo Starting Host Service (.NET)...
start "Host Service" cmd /k "cd host-windows\src\HostService && dotnet run"

echo Waiting for Host Service to start...
timeout /t 5 /nobreak >nul

echo.
echo Starting WebSocket Proxy (Node.js)...
start "Proxy Service" cmd /k "node websocket-proxy.js"

echo Waiting for Proxy Service to start...
timeout /t 3 /nobreak >nul

echo.
echo ✅ All services started!
echo.
echo Services:
echo - Host Service: http://localhost:8081/health
echo - Proxy Service: ws://localhost:8080
echo.
echo Press any key to run debug framework...
pause >nul

echo.
echo Running Comprehensive Debug Framework...
node debug-framework.js

pause