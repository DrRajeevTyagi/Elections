@echo off
echo ========================================
echo   Creating Portable Package
echo ========================================
echo.

set PACKAGE_NAME=student-council-voting-system
set PACKAGE_DIR=%PACKAGE_NAME%

REM Remove old package if exists
if exist %PACKAGE_DIR% (
    echo Removing old package...
    rmdir /s /q %PACKAGE_DIR%
)

if exist %PACKAGE_NAME%.zip (
    echo Removing old zip file...
    del /q %PACKAGE_NAME%.zip
)

echo Creating package directory...
mkdir %PACKAGE_DIR%

echo.
echo Copying files...

REM Copy essential files
xcopy /E /I /Y backend %PACKAGE_DIR%\backend >nul
xcopy /E /I /Y frontend %PACKAGE_DIR%\frontend >nul
xcopy /E /I /Y data %PACKAGE_DIR%\data >nul

REM Exclude node_modules and dist folders
if exist %PACKAGE_DIR%\backend\node_modules rmdir /s /q %PACKAGE_DIR%\backend\node_modules
if exist %PACKAGE_DIR%\backend\dist rmdir /s /q %PACKAGE_DIR%\backend\dist
if exist %PACKAGE_DIR%\frontend\node_modules rmdir /s /q %PACKAGE_DIR%\frontend\node_modules
if exist %PACKAGE_DIR%\frontend\dist rmdir /s /q %PACKAGE_DIR%\frontend\dist

REM Copy documentation and scripts
copy /Y README.md %PACKAGE_DIR%\ >nul
copy /Y USER-GUIDE.md %PACKAGE_DIR%\ >nul
copy /Y DEPLOYMENT-GUIDE.md %PACKAGE_DIR%\ >nul
copy /Y INSTALL-AND-RUN.bat %PACKAGE_DIR%\ >nul
copy /Y START-SERVERS.bat %PACKAGE_DIR%\ >nul

echo.
echo ========================================
echo   Package Created Successfully!
echo ========================================
echo.
echo Folder: %PACKAGE_DIR%
echo.
echo To share with others:
echo 1. Compress the '%PACKAGE_DIR%' folder to a ZIP file
echo 2. Send the ZIP file via email, USB, or file sharing
echo 3. Recipients extract the ZIP
echo 4. Recipients double-click INSTALL-AND-RUN.bat
echo.
echo Note: Recipients must have Node.js installed
echo Download from: https://nodejs.org/
echo.
pause






