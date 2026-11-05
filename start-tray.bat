@echo off
setlocal
cd /d "%~dp0"

rem Start the tray host in the background via cmd, not WSH.
start "" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0tray.ps1"

timeout /t 4 /nobreak >nul

netstat -ano | findstr ":7788" | findstr "LISTENING" >nul
if not errorlevel 1 (
  echo.
  echo   OK - started. Look for the icon near the clock.
  timeout /t 2 /nobreak >nul
  exit /b 0
)

echo.
echo   [FAILED] tray did not start within 4s.
echo   Running it in the foreground so the error stays visible...
echo.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0tray.ps1"
echo.
echo   Copy the red text above if it failed again.
pause
