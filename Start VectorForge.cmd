@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title VectorForge AI

echo ==========================================
echo   VectorForge AI
echo ==========================================
echo.

if exist "node_modules\" goto :have_modules
echo Installing dependencies (first run only)...
call npm.cmd install
if errorlevel 1 goto :fail
:have_modules

echo Building the app...
call npm.cmd run build
if errorlevel 1 goto :fail

echo.
echo Starting the server... (closing this window stops the app)
echo.

if "%1"=="--no-open" goto :noopen
call npm.cmd run preview -- --host 127.0.0.1 --port 4173 --open
exit /b %errorlevel%
:noopen
call npm.cmd run preview -- --host 127.0.0.1 --port 4173
exit /b %errorlevel%

:fail
echo.
echo ==========================================
echo   Something went wrong. See errors above.
echo ==========================================
pause
exit /b 1
