@echo off
echo ===============================================
echo    TruckOptimum - One-Click Startup Script
echo ===============================================
echo.

:: Set the working directory to the app location
cd /d "%~dp0"

:: Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.7+ and try again
    pause
    exit /b 1
)

:: Check if required dependencies are installed
echo Checking dependencies...
python -c "import flask, sqlite3" >nul 2>&1
if errorlevel 1 (
    echo Installing required dependencies...
    pip install flask sqlite3
    if errorlevel 1 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

:: Start the application
echo.
echo Starting TruckOptimum Application...
echo Application will open automatically in your browser
echo Press Ctrl+C to stop the server when done
echo.

:: Run the Flask application
python TruckOptimum/app.py

:: If we get here, the app has stopped
echo.
echo TruckOptimum has been stopped
pause