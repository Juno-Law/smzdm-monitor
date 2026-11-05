@echo off
rem Launches the tray host in a hidden window and returns immediately.
rem No port checking here: that is the tray host's job, and a wrong guess
rem used to show a bogus [FAILED] line. See data\tray.log for what happened.
cd /d "%~dp0"
start "" "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0tray.ps1"
