@echo off
setlocal

REM =======================================
REM Development Mode - Only Node.js
REM =======================================
set PORT=3001
set NODE_DIR=C:\FluidDAM
REM =======================================

echo ============================================
echo FluidDAM Development Server
echo ============================================

REM --- Start Node.js Server Only ---
echo [INFO] Starting Node.js server for development...
cd /d %NODE_DIR%
if exist package.json (
  echo [INFO] Found Node.js project in %NODE_DIR%
  echo [INFO] Starting server on http://localhost:%PORT%
  start "FluidDAM Dev Server" cmd /k "npm run server"
  echo [OK] Development server started
  echo [INFO] Access your app at: http://localhost:%PORT%
) else (
  echo [ERROR] package.json not found in %NODE_DIR%
  echo [ERROR] Please check the NODE_DIR path in this script
  pause
  exit /b
)

echo ============================================
echo Development server is ready!
echo ============================================

pause
