const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

let mainWindow;

// ============================================================
// RUTAS DE DATOS Y LICENCIA
// ============================================================
const userDataPath = app.getPath('userData');
const dataPath = path.join(userDataPath, 'parqueadero-data.json');
const licensePath = path.join(userDataPath, 'license.json');

// ============================================================
// SISTEMA DE LICENCIAS
// ============================================================
const LICENSE_SECRET = 'parqueadero-inteligente-2026-secret-key';

function generateLicenseKey(email, expiryDate) {
    const data = email + '|' + expiryDate + '|' + LICENSE_SECRET;
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 32).toUpperCase();
}

function verifyLicense(licenseData) {
    if (!licenseData || !licenseData.email || !licenseData.key || !licenseData.expiryDate) {
        return { valid: false, message: 'Licencia incompleta' };
    }
    const expectedKey = generateLicenseKey(licenseData.email, licenseData.expiryDate);
    if (licenseData.key !== expectedKey) {
        return { valid: false, message: 'Clave de licencia invalida' };
    }
    const now = new Date();
    const expiry = new Date(licenseData.expiryDate);
    if (now > expiry) {
        return { valid: false, message: 'Licencia expirada', expiryDate: licenseData.expiryDate };
    }
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    return { valid: true, message: 'Licencia valida', daysLeft, expiryDate: licenseData.expiryDate, email: licenseData.email };
}

function loadLicense() {
    try {
        if (fs.existsSync(licensePath)) {
            const data = JSON.parse(fs.readFileSync(licensePath, 'utf8'));
            return verifyLicense(data);
        }
    } catch (err) { console.error('Error cargando licencia:', err); }
    return { valid: false, message: 'Sin licencia registrada' };
}

function saveLicense(licenseData) {
    try {
        fs.writeFileSync(licensePath, JSON.stringify(licenseData, null, 2));
        return true;
    } catch (err) { console.error('Error guardando licencia:', err); return false; }
}


// ===== AUTO UPDATER =====
// ========================
function setupAutoUpdater() {
    if (!app.isPackaged) {
        log.info('Modo desarrollo - auto-updater desactivado');
        return;
    }

    autoUpdater.logger = log;
    autoUpdater.logger.transports.file.level = 'info';

    setTimeout(() => {
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
            log.error('Error checking updates:', err);
        });
    }, 5000);

    setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify().catch(err => {
            log.error('Error checking updates:', err);
        });
    }, 30 * 60 * 1000);

    autoUpdater.on('update-available', () => {
        log.info('Actualización disponible');
    });

    autoUpdater.on('update-downloaded', () => {
        dialog.showMessageBox({
            type: 'question',
            buttons: ['Reiniciar ahora', 'Más tarde'],
            defaultId: 0,
            title: 'Actualización lista',
            message: 'Se descargó una nueva versión.',
            detail: '¿Reiniciar para instalar ahora?',
            cancelId: 1
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall(false, true);
            }
        });
    });

    autoUpdater.on('error', (err) => {
        log.error('Error en auto-updater:', err);
    });
}
// ============================================================
// CREAR VENTANA PRINCIPAL
// ============================================================
function createWindow() {
    let iconPath;
    if (process.platform === 'win32') {
        iconPath = path.join(__dirname, 'iconos', 'icon.ico');
    } else if (process.platform === 'darwin') {
        iconPath = path.join(__dirname, 'iconos', 'icon.icns');
    } else {
        iconPath = path.join(__dirname, 'iconos', 'icon.png');
    }

    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1200,
        minHeight: 700,
        icon: iconPath,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            enableRemoteModule: true
        },
        titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
        show: false,
        backgroundColor: '#0a1628'
    });

    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => { mainWindow.show(); });

    // ===== IPC: LICENCIA =====
    ipcMain.on('check-license', (event) => {
        event.reply('check-license-response', loadLicense());
    });

    ipcMain.on('activate-license', (event, { email, key, expiryDate }) => {
        const licenseData = { email, key, expiryDate };
        const verification = verifyLicense(licenseData);
        if (verification.valid) saveLicense(licenseData);
        event.reply('activate-license-response', verification);
    });

    ipcMain.on('generate-demo-license', (event, { email, days }) => {
        const expiryDate = new Date();
        expiryDate.setDate(expiryDate.getDate() + days);
        const expiryStr = expiryDate.toISOString().split('T')[0];
        const key = generateLicenseKey(email, expiryStr);
        const licenseData = { email, key, expiryDate: expiryStr };
        saveLicense(licenseData);
        event.reply('generate-demo-license-response', { success: true, license: licenseData, verification: verifyLicense(licenseData) });
    });

    // ===== IPC: PERSISTENCIA CON BACKUPS =====
    ipcMain.on('save-data', (event, data) => {
        try {
            if (fs.existsSync(dataPath)) {
                const backupPath = dataPath + '.backup.' + Date.now();
                fs.copyFileSync(dataPath, backupPath);
                const backupFiles = fs.readdirSync(userDataPath)
                    .filter(f => f.startsWith('parqueadero-data.json.backup.'))
                    .sort().reverse();
                if (backupFiles.length > 5) {
                    backupFiles.slice(5).forEach(f => {
                        try { fs.unlinkSync(path.join(userDataPath, f)); } catch(e) {}
                    });
                }
            }
            fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
            event.reply('save-data-response', { success: true });
        } catch (err) {
            event.reply('save-data-response', { success: false, error: err.message });
        }
    });

    ipcMain.on('load-data', (event) => {
        try {
            if (fs.existsSync(dataPath)) {
                const data = fs.readFileSync(dataPath, 'utf8');
                event.reply('load-data-response', { success: true, data: JSON.parse(data) });
            } else {
                event.reply('load-data-response', { success: true, data: null });
            }
        } catch (err) {
            event.reply('load-data-response', { success: false, error: err.message });
        }
    });

    // ===== IPC: EXPORTAR CSV =====
    ipcMain.on('export-csv', (event, { filename, content }) => {
        try {
            const downloadsPath = app.getPath('downloads');
            const filePath = path.join(downloadsPath, filename);
            fs.writeFileSync(filePath, content, 'utf8');
            event.reply('export-csv-response', { success: true, path: filePath });
        } catch (err) {
            event.reply('export-csv-response', { success: false, error: err.message });
        }
    });

    mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
    createWindow();
    setupAutoUpdater();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
