@echo off
title StockGhost Frontend Client
echo ========================================================
echo       StockGhost ERP - React Frontend Dashboard
echo   Dead Stock & Blocked Capital Detection System
echo ========================================================
cd /d "%~dp0frontend"
echo Installing node dependencies...
call npm install
echo.
echo Starting Vite development server on http://localhost:5173 ...
call npm run dev
pause
