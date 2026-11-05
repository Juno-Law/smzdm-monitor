@echo off
setlocal
cd /d "%~dp0"
if not exist "data" md "data"
set "LOG=%~dp0data\bat.log"
set "FLAG=%~dp0data\boot.flag"
set "PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
set "RUN=-NoProfile -ExecutionPolicy Bypass -File %~dp0tray.ps1"

call :log "begin"
if not exist "%PS%" (
  call :log "powershell missing: %PS%"
  exit /b 1
)

del /q "%FLAG%" >nul 2>&1

rem Do NOT add -WindowStyle Hidden here. When this bat is started by a
rem double-click, "start <ps> -WindowStyle Hidden" is rejected with
rem errorlevel 786 (0x312, the same code the VBS reported as 0x80070312).
rem So: launch minimised, and tray.ps1 hides its own console from inside.
start "" /min "%PS%" %RUN%
call :log "launch errorlevel=%errorlevel%"

for /l %%i in (1,1,8) do (
  ping -n 2 127.0.0.1 >nul
  if exist "%FLAG%" goto :ok
)

call :log "no boot.flag after 8s, checking data\tray.log for the reason"
exit /b 1

:ok
call :log "started ok"
exit /b 0

:log
echo [%date% %time%] %~1>>"%LOG%"
exit /b 0
