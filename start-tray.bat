@echo off
setlocal
cd /d "%~dp0"

rem Cold start takes 6-10s (WAF handshake + loading history), so give it 20s.
start "" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0tray.ps1"

for /l %%i in (1,1,20) do (
  timeout /t 1 /nobreak >nul
  netstat -ano | findstr ":7788" | findstr "LISTENING" >nul && goto :ok
)
goto :fail

:ok
echo.
echo   OK - running. Look for the icon near the clock (may be under the ^ arrow).
timeout /t 2 /nobreak >nul
exit /b 0

:fail
echo.
echo   [FAILED] port 7788 still not listening after 20s.
echo.
if exist "%~dp0data\run.err.log" (
  echo   ---- data\run.err.log ----
  type "%~dp0data\run.err.log"
  echo.
)
echo   Also check data\run.log for the last round.
echo   Copy this window content back if it keeps failing.
pause
