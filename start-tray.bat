@echo off
rem Fallback launcher: use this if the vbs gets blocked.
rem The console window flashes for a moment, then only the tray icon remains.
start "" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0tray.ps1"
exit
