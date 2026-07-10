@echo off
title Destructo Game Launcher
setlocal enabledelayedexpansion

:: Color codes: 0B = Black background, Light Aqua text
color 0B

echo =======================================================================
echo.
echo    ########  ########  ######  ######## ########  ##     ##  ######  ########  #######  
echo    ##     ## ##       ##    ##    ##    ##     ## ##     ## ##    ##    ##    ##     ## 
echo    ##     ## ##       ##          ##    ##     ## ##     ## ##          ##    ##     ## 
echo    ##     ## ######    ######     ##    ########  ##     ## ##          ##    ##     ## 
echo    ##     ## ##             ##    ##    ##   ##   ##     ## ##          ##    ##     ## 
echo    ##     ## ##       ##    ##    ##    ##    ##  ##     ## ##    ##    ##    ##     ## 
echo    ########  ########  ######     ##    ##     ##  #######   ######     ##     #######  
echo.
echo =======================================================================
echo                    Web-Native Low-Poly Action RTS Launcher
echo =======================================================================
echo.

:: 1. Check if Node.js is installed
node -v >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo [ERROR] Node.js is not installed on this system.
    echo.
    echo Node.js is required to run the local game server.
    echo.
    set /p "install_node=Would you like to install Node.js automatically using Windows Package Manager? (y/n): "
    if /i "!install_node!"=="y" (
        echo.
        echo [INFO] Running: winget install OpenJS.NodeJS
        echo.
        winget install OpenJS.NodeJS
        echo.
        echo =======================================================================
        echo [SUCCESS] Installation initiated. 
        echo Please restart this launcher (double-click play.cmd again) after 
        echo the Node.js installation is complete.
        echo =======================================================================
    ) else (
        echo.
        echo Please download and install Node.js manually from:
        echo https://nodejs.org/
        echo.
    )
    pause
    exit /b
)

:: 2. Check if dependencies are installed (node_modules folder)
if not exist "%~dp0node_modules" (
    echo [INFO] First-time setup: Game dependencies are missing.
    echo [INFO] Installing required libraries (this might take a moment)...
    echo.
    cd /d "%~dp0"
    call npm install
    if !errorlevel! neq 0 (
        color 0C
        echo.
        echo [ERROR] Failed to install game dependencies. 
        echo Please check your internet connection and try running this script as Administrator.
        pause
        exit /b
    )
    echo.
    echo [SUCCESS] Dependencies installed successfully!
    echo.
)

:: 3. Run the development server and open the browser
echo [INFO] Launching Destructo...
echo [INFO] The game will open in your default browser shortly.
echo [INFO] Press [Ctrl + C] in this window to stop the server when you are done playing.
echo.
cd /d "%~dp0"
call npm run dev -- --open

pause
