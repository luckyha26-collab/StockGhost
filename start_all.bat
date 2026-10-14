@echo off
title StockGhost ERP Launcher
echo ========================================================
echo        Launching StockGhost Full-Stack System
echo   Dead Stock & Blocked Capital Detection System
echo ========================================================
echo.
echo 1. Starting Backend API on http://127.0.0.1:5050 ...
start "StockGhost Backend" cmd /k "cd /d %~dp0 && run_backend.bat"

echo 2. Waiting 3 seconds for Backend to initialize...
timeout /t 3 /nobreak >nul

echo 3. Starting Frontend React Client on http://localhost:5173 ...
start "StockGhost Frontend" cmd /k "cd /d %~dp0 && run_frontend.bat"

echo.
echo Both services launched in separate windows!
echo Backend API: http://127.0.0.1:5050
echo Frontend UI: http://localhost:5173
echo.
echo Press any key to exit this launcher window...
pause >nul
