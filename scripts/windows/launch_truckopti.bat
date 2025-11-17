@echo off
title TruckOpti Enterprise - Starting...
echo =========================================
echo   TruckOpti Enterprise v3.6.0
echo   Advanced 3D Truck Loading System
echo =========================================
echo.

:: Set Python path and environment
set PYTHONPATH=%cd%;%cd%\app;%cd%\TruckOpti_Microsoft
cd /d "%cd%"

:: Check if Python is available
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ and try again
    pause
    exit /b 1
)

echo ✅ Python found
echo 🚀 Starting TruckOpti Enterprise...
echo.

:: Start the application
python app\main.py

echo.
echo TruckOpti Enterprise has been stopped.
pause
