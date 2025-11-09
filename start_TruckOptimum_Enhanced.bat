@echo off
setlocal enabledelayedexpansion

echo ===============================================
echo    TruckOptimum - Enhanced One-Click Startup
echo ===============================================
echo.

:: Set the working directory to the script location
cd /d "%~dp0"

:: Configuration
set PYTHON_CMD=python
set APP_MODULE=TruckOptimum\app.py
set REQUIRED_PACKAGES=flask
set DEFAULT_PORT=5001
set BROWSER_URL=http://127.0.0.1:5001

:: Color codes for better output
set "RED=[91m"
set "GREEN=[92m"
set "YELLOW=[93m"
set "BLUE=[94m"
set "NC=[0m"  # No Color

echo %BLUE%Checking system requirements...%NC%
echo.

:: Check if Python is installed
echo [%TIME%] Checking Python installation...
%PYTHON_CMD% --version >nul 2>&1
if errorlevel 1 (
    echo %RED%ERROR: Python is not installed or not in PATH%NC%
    echo.
    echo Please install Python 3.7 or higher:
    echo 1. Download from https://python.org
    echo 2. During installation, check "Add Python to PATH"
    echo 3. Restart your computer after installation
    echo.
    pause
    exit /b 1
)

:: Get Python version
for /f "tokens=2" %%i in ('%PYTHON_CMD% --version 2^>^&1') do set PYTHON_VERSION=%%i
echo [%TIME%] Python %PYTHON_VERSION% found
echo.

:: Check if pip is available
echo [%TIME%] Checking pip...
%PYTHON_CMD% -m pip --version >nul 2>&1
if errorlevel 1 (
    echo %RED%ERROR: pip is not available%NC%
    echo Please ensure pip is installed with Python
    pause
    exit /b 1
)
echo [%TIME%] pip is available
echo.

:: Install required packages
echo %YELLOW%Checking and installing required packages...%NC%
echo.

:: Install Flask
echo [%TIME%] Installing Flask...
%PYTHON_CMD% -m pip install flask --quiet --disable-pip-version-check
if errorlevel 1 (
    echo %RED%ERROR: Failed to install Flask%NC%
    echo Trying to upgrade pip first...
    %PYTHON_CMD% -m pip install --upgrade pip
    %PYTHON_CMD% -m pip install flask --quiet
    if errorlevel 1 (
        echo %RED%ERROR: Failed to install Flask even after pip upgrade%NC%
        echo Please install manually: pip install flask
        pause
        exit /b 1
    )
)
echo [%TIME%] Flask installed successfully
echo.

:: Check for other optional dependencies
echo [%TIME%] Checking optional dependencies...
%PYTHON_CMD% -c "import sqlite3" >nul 2>&1
if errorlevel 1 (
    echo %YELLOW%Warning: sqlite3 not available (this is usually built into Python)%NC%
) else (
    echo [%TIME%] SQLite3 available
)

%PYTHON_CMD% -c "import numpy" >nul 2>&1
if errorlevel 1 (
    echo [%TIME%] Installing numpy (optional, for advanced algorithms)...
    %PYTHON_CMD% -m pip install numpy --quiet --disable-pip-version-check
) else (
    echo [%TIME%] NumPy available (for advanced algorithms)
)
echo.

:: Check if the app file exists
if not exist "%APP_MODULE%" (
    echo %RED%ERROR: Application file not found: %APP_MODULE%%NC%
    echo.
    echo Current directory: %CD%
    echo Looking for: %APP_MODULE%
    echo.
    echo Please ensure you're running this script from the correct directory
    echo that contains the TruckOptimum folder.
    pause
    exit /b 1
)

:: Create logs directory if it doesn't exist
if not exist "logs" (
    mkdir logs
    echo [%TIME%] Created logs directory
)

echo %GREEN%All requirements met!%NC%
echo.
echo ===============================================
echo    Starting TruckOptimum Application
echo ===============================================
echo.
echo %BLUE%Application Details:%NC%
echo - URL: %BROWSER_URL%
echo - Port: %DEFAULT_PORT%
echo - Working Directory: %CD%
echo.
echo %YELLOW%Instructions:%NC%
echo 1. The application will start automatically
echo 2. Your default browser will open to the application
echo 3. Press Ctrl+C in this window to stop the server
echo 4. Close this window to exit completely
echo.
echo %BLUE%Starting application...%NC%
echo.

:: Give user time to read the instructions
timeout /t 3 /nobreak >nul

:: Start the Flask application
echo [%TIME%] Starting Flask server...
%PYTHON_CMD% %APP_MODULE%

:: If we get here, the app has stopped
echo.
echo ===============================================
echo    TruckOptimum has been stopped
echo ===============================================
echo.
echo %YELLOW%To start again, simply double-click this batch file%NC%
echo.
pause