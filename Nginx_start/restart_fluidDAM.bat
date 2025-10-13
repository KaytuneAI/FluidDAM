@echo off
setlocal

REM =======================================
REM FluidDAM Restart Script
REM =======================================
set PORT=3001
set NODE_DIR=C:\FluidDAM
REM =======================================

echo ============================================
echo Restarting FluidDAM Application
echo ============================================

REM --- Stop existing process ---
echo [INFO] Stopping existing FluidDAM process...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%PORT% ^| findstr LISTENING') do set PID=%%a
if defined PID (
  echo [INFO] Found existing process (PID %PID%), stopping...
  taskkill /F /PID %PID% >nul 2>&1
  timeout /t 2 /nobreak >nul
)

REM --- Start new process ---
echo [INFO] Starting FluidDAM server...
cd /d %NODE_DIR%
if exist package.json (
  echo [INFO] Found FluidDAM project in %NODE_DIR%
  start "FluidDAM Server" cmd /k "npm run server"
  timeout /t 3 /nobreak >nul
  echo [OK] FluidDAM server restarted on port %PORT%
) else (
  echo [ERROR] package.json not found in %NODE_DIR%
  echo [ERROR] Please check the NODE_DIR path in this script
  pause
  exit /b
)

echo ============================================
echo FluidDAM restarted successfully!
echo Access: http://localhost:%PORT%
echo ============================================

pause
