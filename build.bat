@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

set PROJECT_DIR=%~dp0
cd /d "%PROJECT_DIR%"

echo ============================================
echo  HACS Compatibility Auditor Card - Build
echo ============================================
echo.

:: 1. Install dependencies if needed
if not exist "node_modules\" (
    echo [1/3] Instalando dependencias...
    call npm install
    if errorlevel 1 (
        echo ERROR: npm install fallo
        pause
        exit /b 1
    )
) else (
    echo [1/3] Dependencias ya instaladas, saltando...
)

:: 2. Type check
echo.
echo [2/3] Type-check...
call npm run type-check
if errorlevel 1 (
    echo ERROR: Type-check fallo
    pause
    exit /b 1
)

:: 3. Build
echo.
echo [3/3] Build (production)...
call npm run build
if errorlevel 1 (
    echo ERROR: Build fallo
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Build completado exitosamente
echo  Output: dist\hacs-compatibility-auditor-card.js
echo ============================================
echo.
pause
