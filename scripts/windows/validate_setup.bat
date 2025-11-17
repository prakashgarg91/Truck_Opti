@echo off
setlocal

echo ===============================================
echo    TruckOptimum Setup Validation Test
echo ===============================================
echo.

:: Set the working directory to the script location
cd /d "%~dp0"

:: Color codes
set "GREEN=[92m"
set "RED=[91m"
set "YELLOW=[93m"
set "BLUE=[94m"
set "NC=[0m"

set "PASS_COUNT=0"
set "TOTAL_CHECKS=6"

echo %BLUE%Running system validation checks...%NC%
echo.

:: Check 1: Python Installation
echo [1/6] Checking Python installation...
python --version >nul 2>&1
if errorlevel 1 (
    echo %RED%   ❌ FAIL: Python not found%NC%
    echo %YELLOW%   💡 Solution: Install Python 3.7+ from python.org%NC%
) else (
    echo %GREEN%   ✅ PASS: Python installed%NC%
    for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
    echo %BLUE%   📋 Version: %PYTHON_VERSION%%NC%
    set /a PASS_COUNT+=1
)
echo.

:: Check 2: Required Files
echo [2/6] Checking required files...
set "FILES_OK=1"
if not exist "start_TruckOptimum_Enhanced.bat" (
    echo %RED%   ❌ FAIL: start_TruckOptimum_Enhanced.bat not found%NC%
    set "FILES_OK=0"
)
if not exist "TruckOptimum\app.py" (
    echo %RED%   ❌ FAIL: TruckOptimum\app.py not found%NC%
    set "FILES_OK=0"
)
if not exist "README_STARTUP.md" (
    echo %RED%   ❌ FAIL: README_STARTUP.md not found%NC%
    set "FILES_OK=0"
)

if %FILES_OK%==1 (
    echo %GREEN%   ✅ PASS: All required files present%NC%
    set /a PASS_COUNT+=1
) else (
    echo %YELLOW%   💡 Solution: Ensure all files are in the correct locations%NC%
)
echo.

:: Check 3: Pip Availability
echo [3/6] Checking pip installation...
python -m pip --version >nul 2>&1
if errorlevel 1 (
    echo %RED%   ❌ FAIL: pip not available%NC%
    echo %YELLOW%   💡 Solution: Reinstall Python with pip%NC%
) else (
    echo %GREEN%   ✅ PASS: pip available%NC%
    set /a PASS_COUNT+=1
)
echo.

:: Check 4: Flask Installation
echo [4/6] Checking Flask installation...
python -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo %YELLOW%   ⚠️  WARNING: Flask not installed%NC%
    echo %BLUE%   📋 The startup script will install Flask automatically%NC%
) else (
    echo %GREEN%   ✅ PASS: Flask installed%NC%
    set /a PASS_COUNT+=1
)
echo.

:: Check 5: Directory Permissions
echo [5/6] Checking directory permissions...
echo test > test_write.tmp 2>nul
if exist test_write.tmp (
    del test_write.tmp
    echo %GREEN%   ✅ PASS: Write permissions OK%NC%
    set /a PASS_COUNT+=1
) else (
    echo %RED%   ❌ FAIL: No write permissions%NC%
    echo %YELLOW%   💡 Solution: Run as Administrator%NC%
)
echo.

:: Check 6: Internet Connectivity
echo [6/6] Checking internet connectivity...
ping -n 1 pypi.org >nul 2>&1
if errorlevel 1 (
    echo %YELLOW%   ⚠️  WARNING: No internet connection%NC%
    echo %BLUE%   📋 Flask must be pre-installed for offline use%NC%
) else (
    echo %GREEN%   ✅ PASS: Internet connection available%NC%
    set /a PASS_COUNT+=1
)
echo.

:: Results Summary
echo ===============================================
echo    Validation Results
echo ===============================================
echo.
echo %BLUE%Checks Passed: %PASS_COUNT%/%TOTAL_CHECKS%%NC%
echo.

if %PASS_COUNT%==%TOTAL_CHECKS% (
    echo %GREEN%🎉 EXCELLENT! Your system is fully ready!%NC%
    echo.
    echo %GREEN%✅ You can now run TruckOptimum with confidence%NC%
    echo %BLUE%📋 Next step: Double-click start_TruckOptimum_Enhanced.bat%NC%
) else if %PASS_COUNT% GTR 4 (
    echo %YELLOW%⚠️  GOOD: Most requirements met%NC%
    echo.
    echo %YELLOW%🔧 Minor issues detected, but application should work%NC%
    echo %BLUE%📋 Next step: Try running start_TruckOptimum_Enhanced.bat%NC%
) else (
    echo %RED%❌ NEEDS ATTENTION: Several requirements missing%NC%
    echo.
    echo %RED%🔧 Please address the issues above before running%NC%
    echo %YELLOW%💡 Run this test again after fixing issues%NC%
)

echo.
echo %BLUE%Quick Actions:%NC%
echo 1. %GREEN%Start App:%NC% Double-click start_TruckOptimum_Enhanced.bat
echo 2. %GREEN%Create Shortcuts:%NC% Run install_desktop_shortcut.bat
echo 3. %GREEN%View Guide:%NC% Open README_STARTUP.md
echo 4. %GREEN%Test Again:%NC% Run this validation script
echo.
echo %YELLOW%💡 Tip: Run this validation after making any system changes%NC%
echo.
pause