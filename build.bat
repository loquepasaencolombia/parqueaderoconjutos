@echo off
echo Compilando Parqueadero Inteligente...

node -v >nul 2>&1
if errorlevel 1 (
    echo Node.js no esta instalado. Descargalo de https://nodejs.org
    pause
    exit /b 1
)

echo Instalando dependencias...
npm install

echo Compilando para Windows...
npm run build-win

echo Compilacion completada!
echo Los instaladores estan en la carpeta 'dist/'
pause
