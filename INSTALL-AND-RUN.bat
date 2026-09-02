@echo off
color 0A
echo ========================================
echo   Student Council Voting System
echo   INSTALLER
echo ========================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo.
    echo Please install Node.js first:
    echo 1. Go to: https://nodejs.org/
    echo 2. Download and install the LTS version
    echo 3. Restart your computer
    echo 4. Run this installer again
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js found!
node --version
echo.

REM Check if npm is available
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] npm is not available!
    echo Please reinstall Node.js
    pause
    exit /b 1
)

echo [OK] npm found!
npm --version
echo.

echo ========================================
echo   Installing Backend Dependencies...
echo ========================================
cd /d %~dp0backend
if not exist node_modules (
    echo Installing packages... (this may take 1-2 minutes)
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Backend installation failed!
        pause
        exit /b 1
    )
) else (
    echo Backend dependencies already installed!
)
echo.

echo ========================================
echo   Installing Frontend Dependencies...
echo ========================================
cd /d %~dp0frontend
if not exist node_modules (
    echo Installing packages... (this may take 1-2 minutes)
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Frontend installation failed!
        pause
        exit /b 1
    )
) else (
    echo Frontend dependencies already installed!
)
echo.

echo ========================================
echo   INSTALLATION COMPLETE!
echo ========================================
echo.
echo Starting servers...
timeout /t 2 /nobreak >nul

cd /d %~dp0
call START-SERVERS.bat

echo.
echo Installation and startup complete!
pause






