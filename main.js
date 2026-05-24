const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// Ruta para guardar datos localmente (sin internet)
const userDataPath = app.getPath('userData');
const dataPath = path.join(userDataPath, 'parqueadero-data.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    icon: path.join(__dirname, 'iconos', 'icon.png'),
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

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // mainWindow.maximize(); // Descomentar para abrir maximizado
  });

  // Manejar guardado de datos
  ipcMain.on('save-data', (event, data) => {
    try {
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
      event.reply('save-data-response', { success: true });
    } catch (err) {
      event.reply('save-data-response', { success: false, error: err.message });
    }
  });

  // Manejar carga de datos
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

  // Exportar CSV
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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
