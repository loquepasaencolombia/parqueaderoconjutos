# 🚗 Parqueadero Inteligente - Instalación

## Requisitos
- **Windows**: Windows 10/11 (64-bit)
- **Mac**: macOS 10.14+ (Intel o Apple Silicon)

## Instalación

### Windows
1. Ejecuta `Parqueadero-Inteligente-Setup-1.0.0.exe`
2. Sigue el asistente de instalación
3. Se creará un acceso directo en el escritorio
4. ¡Listo! Haz doble clic en el icono para abrir

### Mac
1. Abre `Parqueadero-Inteligente-1.0.0.dmg`
2. Arrastra la app a la carpeta "Aplicaciones"
3. Abre desde Aplicaciones o Launchpad
4. Si aparece advertencia de seguridad, ve a:
   `Preferencias del Sistema > Seguridad y Privacidad > Abrir de todos modos`

## Para Desarrolladores - Compilar desde código

### 1. Instalar Node.js
Descarga desde: https://nodejs.org (versión LTS)

### 2. Instalar dependencias
```bash
cd parqueadero-app
npm install
```

### 3. Ejecutar en modo desarrollo
```bash
npm start
```

### 4. Compilar instalador
```bash
# Windows
npm run build-win

# Mac
npm run build-mac

# Ambos
npm run build-all
```

Los instaladores se generarán en la carpeta `dist/`.

## Características
✅ Funciona 100% offline (sin internet)
✅ Base de datos local persistente
✅ Soporte para cámaras LPR y facial
✅ Tickets de cobro imprimibles
✅ Gestión de residentes, visitantes y Airbnb
✅ Alertas automáticas por tiempo excedido
✅ Exportación CSV de historial

## Soporte
Para soporte técnico contactar a: soporte@tuempresa.com
