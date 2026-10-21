@echo off
REM ============================================================
REM   Bistro POS - Configurar impresora (QZ Tray)
REM ------------------------------------------------------------
REM   Doble clic en este archivo. Aparecera un aviso de Windows
REM   pidiendo permisos: presiona "Si".
REM   Esto deja la impresora lista para imprimir sin avisos.
REM ============================================================

REM --- Auto-elevacion a administrador ---
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Solicitando permisos de administrador...
    powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

setlocal
set "QZ_DIR=C:\Program Files\QZ Tray"
set "SRC_CERT=%~dp0override.crt"
set "DST_CERT=%QZ_DIR%\override.crt"

echo.
echo ============================================
echo   Bistro POS - Configurando QZ Tray
echo ============================================
echo.

REM --- Verificar que QZ Tray este instalado ---
if not exist "%QZ_DIR%\qz-tray.exe" (
    echo ERROR: No se encontro QZ Tray en "%QZ_DIR%".
    echo Instala QZ Tray primero desde https://qz.io/download/ y vuelve a ejecutar este archivo.
    echo.
    pause
    exit /b 1
)

REM --- Verificar que el certificado de origen exista ---
if not exist "%SRC_CERT%" (
    echo ERROR: No se encontro el archivo override.crt junto a este instalador.
    echo Asegurate de mantener override.crt en la misma carpeta que este .bat.
    echo.
    pause
    exit /b 1
)

REM --- Cerrar QZ Tray ---
echo Cerrando QZ Tray...
taskkill /f /im qz-tray.exe >nul 2>&1
taskkill /f /im qz-tray-console.exe >nul 2>&1
REM Cerrar el java embebido de QZ (runtime\bin\javaw.exe) usando PowerShell
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like '*QZ Tray*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 2 /nobreak >nul

REM --- Respaldar certificado anterior si existe ---
if exist "%DST_CERT%" (
    copy /y "%DST_CERT%" "%DST_CERT%.bak" >nul 2>&1
    echo Respaldo del certificado anterior creado.
)

REM --- Copiar el certificado de Bistro ---
copy /y "%SRC_CERT%" "%DST_CERT%" >nul
if %errorLevel% neq 0 (
    echo ERROR: No se pudo copiar el certificado. Intenta de nuevo.
    echo.
    pause
    exit /b 1
)
echo Certificado de Bistro POS instalado correctamente.

REM --- Reiniciar QZ Tray ---
echo Reiniciando QZ Tray...
start "" "%QZ_DIR%\qz-tray.exe"

echo.
echo ============================================
echo   LISTO. Ya puedes imprimir sin avisos.
echo ============================================
echo.
pause
endlocal
