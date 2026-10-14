@echo off
title StockGhost Backend Server (Port 5050)
cd /d "%~dp0backend"

echo ========================================================
echo        StockGhost ERP - Backend Server (Port 5050)
echo   Dead Stock & Blocked Capital Detection System
echo ========================================================
echo.

:: Detect Python executable
set PY_CMD=
where python >nul 2>nul
if %errorlevel%==0 (
    set PY_CMD=python
) else (
    where py >nul 2>nul
    if %errorlevel%==0 (
        set PY_CMD=py
    ) else (
        where python3 >nul 2>nul
        if %errorlevel%==0 (
            set PY_CMD=python3
        )
    )
)

if "%PY_CMD%"=="" (
    echo [ERROR] Python was not found in your system PATH!
    echo Please install Python from https://www.python.org/
    echo and ensure "Add Python to PATH" is checked during installation.
    echo.
    pause
    exit /b 1
)

echo [1/2] Detected Python: %PY_CMD%
%PY_CMD% --version

echo.
echo [2/2] Attempting to launch Flask server...
%PY_CMD% -m pip install -r requirements.txt >nul 2>nul
%PY_CMD% app.py

:: If app.py stopped or failed, fallback to zero-dependency server.py
if %errorlevel% neq 0 (
    echo.
    echo [NOTE] Flask had a startup issue. Starting Zero-Dependency Backend server on port 5050...
    %PY_CMD% server.py
)

pause
