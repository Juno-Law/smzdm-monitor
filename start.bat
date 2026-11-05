@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 好价监控
echo 启动中，浏览器窗口会自动移到屏幕外，属正常现象。
echo 历史页：http://localhost:7788
echo 按 Ctrl+C 停止。
echo.
node src\index.js
pause
