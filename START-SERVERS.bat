@echo off
color 0A
echo ========================================
echo   Student Council Voting System
echo   School ^& House Elections
echo ========================================
echo.
echo Checking dependencies...

REM Check if backend node_modules exists
cd /d %~dp0backend
if not exist node_modules (
    echo [WARNING] Backend dependencies not installed!
    echo.
    echo Please run INSTALL-AND-RUN.bat first to install dependencies.
    echo.
    pause
    exit /b 1
)

REM Check if frontend node_modules exists
cd /d %~dp0frontend
if not exist node_modules (
    echo [WARNING] Frontend dependencies not installed!
    echo.
    echo Please run INSTALL-AND-RUN.bat first to install dependencies.
    echo.
    pause
    exit /b 1
)

echo [OK] All dependencies found!
echo.
echo ========================================
echo   Starting Servers...
echo ========================================
echo.
echo Starting Backend Server (Port 4000)...
echo    - API Server for votes, candidates, and poll management
start "Backend Server" cmd /k "cd /d %~dp0backend && npm run dev"
timeout /t 3 /nobreak >nul
echo.
echo Starting Frontend Server (Port 5173)...
echo    - Web interface for voting and admin dashboard
start "Frontend Server" cmd /k "cd /d %~dp0frontend && npm run dev"
timeout /t 4 /nobreak >nul
echo.
echo ========================================
echo   SERVERS STARTED SUCCESSFULLY!
echo ========================================
echo.
echo   Backend API:  http://localhost:4000
echo   Frontend App: http://localhost:5173
echo.
echo ========================================
echo   QUICK START GUIDE
echo ========================================
echo.
echo 1. Open your browser and go to:
echo    http://localhost:5173
echo.
echo 2. For Admin Dashboard:
echo    http://localhost:5173/admin
echo    - Switch between School ^& House Elections
echo    - Manage candidates and poll settings
echo    - View live results
echo.
echo 3. For Voting Kiosk:
echo    http://localhost:5173/kiosk
echo    - School Elections: Direct to activation
echo    - House Elections: Select house first, then activate
echo.
echo ========================================
echo   IMPORTANT NOTES
echo ========================================
echo.
echo - Keep both server windows open while using the system
echo - Admin Secret: admin-secret
echo - Kiosk Secret: unlock-me
echo.
echo - School Elections: 5 posts (HB, HG, SSC, SRC, SCC)
echo - House Elections: 3 posts per house (HC, HCC, HSC)
echo   8 Houses: Anand, Dhiraj, Kripa, Prem, Namrata, Nishtha, Satya, Shanti
echo.
echo Press any key to exit this window...
echo (Servers will continue running in separate windows)
echo.
pause >nul






