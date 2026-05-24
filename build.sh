#!/bin/bash
# Script de compilación para Parqueadero Inteligente

echo "🏗️  Compilando Parqueadero Inteligente..."

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado. Descárgalo de https://nodejs.org"
    exit 1
fi

echo "✅ Node.js detectado: $(node -v)"

# Instalar dependencias
echo "📦 Instalando dependencias..."
npm install

# Detectar sistema operativo
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🍎 Detectado macOS - Compilando para Mac..."
    npm run build-mac
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]] || [[ "$OSTYPE" == "win32" ]]; then
    echo "🪟 Detectado Windows - Compilando para Windows..."
    npm run build-win
else
    echo "🐧 Sistema Linux detectado - Compilando para ambos..."
    npm run build-all
fi

echo "✅ Compilación completada!"
echo "📁 Los instaladores están en la carpeta 'dist/'"
