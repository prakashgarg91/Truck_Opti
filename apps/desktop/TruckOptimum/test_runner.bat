@echo off
echo.
echo ============================================================
echo  TruckOptimum - Comprehensive Test Execution Pipeline
echo  Zero Human Debugging Required Testing Framework
echo ============================================================
echo.

REM Check if Python is available
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.7+ and try again
    pause
    exit /b 1
)

REM Check if virtual environment exists
if not exist "venv\" (
    echo Creating Python virtual environment...
    python -m venv venv
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install/update test dependencies
echo Installing test dependencies...
pip install -r requirements_test.txt

REM Parse command line arguments
set TEST_ARGS=

if "%1"=="--quick" (
    set TEST_ARGS=--quick
    echo Running QUICK test suite (unit + integration only)
) else if "%1"=="--unit" (
    set TEST_ARGS=--suite unit
    echo Running UNIT tests only
) else if "%1"=="--integration" (
    set TEST_ARGS=--suite integration
    echo Running INTEGRATION tests only
) else if "%1"=="--ui" (
    set TEST_ARGS=--suite ui
    echo Running UI tests only
) else if "%1"=="--e2e" (
    set TEST_ARGS=--suite e2e
    echo Running END-TO-END tests only
) else if "%1"=="--performance" (
    set TEST_ARGS=--suite performance
    echo Running PERFORMANCE tests only
) else if "%1"=="--visual" (
    set TEST_ARGS=--suite visual
    echo Running VISUAL REGRESSION tests only
) else (
    echo Running COMPREHENSIVE test suite (all tests)
)

echo.
echo Starting test execution...
echo.

REM Run the test pipeline
python run_tests.py %TEST_ARGS%

REM Capture exit code
set TEST_EXIT_CODE=%errorlevel%

echo.
echo ============================================================
if %TEST_EXIT_CODE%==0 (
    echo  ✅ ALL TESTS PASSED - ZERO HUMAN DEBUGGING REQUIRED!
) else (
    echo  ❌ SOME TESTS FAILED - REVIEW REQUIRED
)
echo ============================================================
echo.

REM Open test report in default browser
if exist "reports\comprehensive_report.html" (
    echo Opening comprehensive test report...
    start "" "reports\comprehensive_report.html"
)

REM Keep window open to see results
echo.
echo Press any key to exit...
pause >nul

REM Exit with the same code as tests
exit /b %TEST_EXIT_CODE%