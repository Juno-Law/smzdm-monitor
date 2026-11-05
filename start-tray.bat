@echo off
rem Fallback launcher: use this if the vbs gets blocked by antivirus.
rem The console window flashes for a moment, then only the tray icon remains.
start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0tray.ps1"
exit
