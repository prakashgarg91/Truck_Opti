@echo off
setlocal EnableExtensions DisableDelayedExpansion

rem Force a UTF-8 console so live unattended output from opencode does not mojibake.
"%SystemRoot%\System32\chcp.com" 65001 >nul 2>&1

set "PROJECT_NAME=Truck_Opti"
set "DEFAULT_MAX_RUNS=12"

set "RUNS="
set "FORWARD_ARGS="

:parse_args
if "%~1"=="" goto launch

echo(%~1| findstr /R "^[0-9][0-9]*$" >nul
if not errorlevel 1 if not defined RUNS (
  set "RUNS=%~1"
  shift
  goto parse_args
)

set "FORWARD_ARGS=%FORWARD_ARGS% %1"
shift
goto parse_args

:launch
if not defined RUNS set "RUNS=%DEFAULT_MAX_RUNS%"

powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Github\Frame\run-portfolio.ps1" -ProjectName "%PROJECT_NAME%" -MaxRunsOverride %RUNS%%FORWARD_ARGS%
exit /b %ERRORLEVEL%
