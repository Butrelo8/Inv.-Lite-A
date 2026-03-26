@echo off
REM Run restore verification job - use with Task Scheduler after backup window
cd /d "%~dp0.."
call npm run backup:verify-restore

