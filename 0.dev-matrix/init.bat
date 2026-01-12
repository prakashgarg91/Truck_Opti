@echo off
:: Telegram MCP - Windows launcher for init.ps1
setlocal

set SCRIPT_DIR=%~dp0

:: Prefer PowerShell 5+/7
where pwsh >nul 2>nul
if %ERRORLEVEL%==0 (
    pwsh -ExecutionPolicy Bypass -File "%SCRIPT_DIR%init.ps1" %*
    goto :eof
)

where powershell >nul 2>nul
if %ERRORLEVEL%==0 (
    powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%init.ps1" %*
    goto :eof
)

echo PowerShell not found. Please install PowerShell 7 (pwsh) or Windows PowerShell 5+.
exit /b 1
