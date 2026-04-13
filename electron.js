const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Silence the updater's verbose logging in production
autoUpdater.logger = null;

let mainWindow;
let serverPort;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: "Coach's Email Generator",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL(`http://localhost:${serverPort}`);

  // Open external links in the system browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  // Point the database at the user's writable app-data directory
  // so it survives app updates and isn't locked inside the bundle.
  process.env.DB_PATH = path.join(app.getPath('userData'), 'coach.db');

  const { startServer } = require('./server');
  serverPort = await startServer();

  createWindow();

  // Check for updates after the window is ready (only runs in packaged app)
  if (app.isPackaged) {
    autoUpdater.checkForUpdates();
  }
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'A new version has been downloaded.',
    detail: 'Restart the app now to apply the update, or continue and it will install on next launch.',
    buttons: ['Restart Now', 'Later'],
    defaultId: 0
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
  });
});

// Keep the app running on macOS when all windows are closed (standard Mac behaviour)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Re-open the window when the dock icon is clicked and no windows are open
app.on('activate', () => {
  if (!mainWindow) createWindow();
});
