@echo off
REM Run backup - use with Task Scheduler for nightly backups at 9:00 PM
cd /d "%~dp0.."
call npm run backup
