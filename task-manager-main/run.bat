@echo off
title سیستم مدیریت کارها (امور)
cd /d "%~dp0"
start "" cmd /c "timeout /t 10 /nobreak >nul & start http://localhost:3000"
npm run dev