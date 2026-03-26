@echo off
REM Run integrity scanner - use with Task Scheduler
cd /d "%~dp0.."
call npm run integrity:scan

