@echo off
setlocal

echo ===============================================
echo    TruckOptimum Desktop Shortcut Installer
echo ===============================================
echo.

:: Set the working directory to the script location
cd /d "%~dp0"

:: Check if the batch file exists
if not exist "start_TruckOptimum_Enhanced.bat" (
    echo ERROR: start_TruckOptimum_Enhanced.bat not found
    echo Please ensure this installer is in the same folder as the batch file
    pause
    exit /b 1
)

:: Get the current directory
set "CURRENT_DIR=%CD%"
set "BATCH_FILE=%CURRENT_DIR%\start_TruckOptimum_Enhanced.bat"

:: Desktop directory
set "DESKTOP=%USERPROFILE%\Desktop"

echo Creating desktop shortcut...
echo.

:: Create VBS script for shortcut creation
echo Set oWS = WScript.CreateObject("WScript.Shell") > CreateShortcut.vbs
echo sLinkFile = "%DESKTOP%\TruckOptimum.lnk" >> CreateShortcut.vbs
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> CreateShortcut.vbs
echo oLink.TargetPath = "%BATCH_FILE%" >> CreateShortcut.vbs
echo oLink.WorkingDirectory = "%CURRENT_DIR%" >> CreateShortcut.vbs
echo oLink.Description = "TruckOptimum - Truck Loading Optimization" >> CreateShortcut.vbs
echo oLink.Save >> CreateShortcut.vbs

:: Run the VBS script
cscript CreateShortcut.vbs >nul 2>&1

:: Clean up VBS file
if exist CreateShortcut.vbs del CreateShortcut.vbs

:: Check if shortcut was created
if exist "%DESKTOP%\TruckOptimum.lnk" (
    echo SUCCESS: Desktop shortcut created!
    echo.
    echo You can now:
    echo 1. Double-click the "TruckOptimum" icon on your Desktop
    echo 2. Or run start_TruckOptimum_Enhanced.bat directly
    echo.
) else (
    echo WARNING: Could not create desktop shortcut
    echo.
    echo You can still run the application by double-clicking:
    echo start_TruckOptimum_Enhanced.bat
    echo.
)

:: Also create a start menu shortcut
set "STARTMENU=%APPDATA%\Microsoft\Windows\Start Menu\Programs"
if not exist "%STARTMENU%\TruckOptimum" mkdir "%STARTMENU%\TruckOptimum"

echo Set oWS = WScript.CreateObject("WScript.Shell") > CreateStartMenuShortcut.vbs
echo sLinkFile = "%STARTMENU%\TruckOptimum\TruckOptimum.lnk" >> CreateStartMenuShortcut.vbs
echo Set oLink = oWS.CreateShortcut(sLinkFile) >> CreateStartMenuShortcut.vbs
echo oLink.TargetPath = "%BATCH_FILE%" >> CreateStartMenuShortcut.vbs
echo oLink.WorkingDirectory = "%CURRENT_DIR%" >> CreateStartMenuShortcut.vbs
echo oLink.Description = "TruckOptimum - Truck Loading Optimization" >> CreateStartMenuShortcut.vbs
echo oLink.Save >> CreateStartMenuShortcut.vbs

cscript CreateStartMenuShortcut.vbs >nul 2>&1
if exist CreateStartMenuShortcut.vbs del CreateStartMenuShortcut.vbs

echo Start Menu shortcut created!
echo.

:: Create uninstaller
echo @echo off > uninstall_TruckOptimum_shortcuts.bat
echo echo Removing TruckOptimum shortcuts... >> uninstall_TruckOptimum_shortcuts.bat
echo del /q "%DESKTOP%\TruckOptimum.lnk" 2^>nul >> uninstall_TruckOptimum_shortcuts.bat
echo rmdir /s /q "%STARTMENU%\TruckOptimum" 2^>nul >> uninstall_TruckOptimum_shortcuts.bat
echo del /q "%~dp0uninstall_TruckOptimum_shortcuts.bat" 2^>nul >> uninstall_TruckOptimum_shortcuts.bat
echo echo Shortcuts removed! >> uninstall_TruckOptimum_shortcuts.bat
echo pause >> uninstall_TruckOptimum_shortcuts.bat

echo.
echo ===============================================
echo    Installation Complete!
echo ===============================================
echo.
echo TruckOptimum is now ready to use!
echo.
echo Quick Start Options:
echo 1. Desktop: Double-click "TruckOptimum" icon
echo 2. Start Menu: Programs ^> TruckOptimum ^> TruckOptimum
echo 3. Direct: Run start_TruckOptimum_Enhanced.bat
echo.
echo To remove shortcuts later, run:
echo uninstall_TruckOptimum_shortcuts.bat
echo.
pause