@echo off
title StockGhost ERP 2.0 Launcher
color 0B
echo ===================================================================
echo               👻 StockGhost ERP 2.0 - Enterprise Portal
echo             Dead Stock & Blocked Capital Detection System
echo ===================================================================
echo.
echo [1/2] Starting StockGhost Python Core Server on Port 5050...
start /b python backend/server.py
timeout /t 2 /nobreak >nul

echo [2/2] Launching StockGhost ERP in your web browser...
start http://localhost:5050/

echo.
echo ===================================================================
echo  ✅ StockGhost ERP is LIVE at http://localhost:5050/
echo  • System Administrator : admin / admin123 (Full Access & User Admin)
echo  • Sales Manager        : sales_mgr / sales123 (Outward Sales & Clearance Simulator)
echo  • Inventory Manager    : inventory_mgr / inv123 (SKU Catalog & Inward PO Intake)
echo.
echo  Keep this terminal window open while using the application.
echo  Press Ctrl+C or close this window to stop the server.
echo ===================================================================
echo.
pause
