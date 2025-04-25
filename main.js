const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 800,
    autoHideMenuBar: true,
    menubarvisibility: false,
    resizable: true,
    icon: path.join(__dirname, 'assets', 'icon.jpeg'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Handle file selection
ipcMain.handle('select-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac'] }
    ]
  });
  return result.filePaths;
});

// Handle save playlist
ipcMain.handle('save-playlist', async (event, playlist) => {
  const result = await dialog.showSaveDialog({
    title: 'Save Playlist',
    defaultPath: 'playlist.json',
    filters: [
      { name: 'JSON Files', extensions: ['json'] }
    ]
  });
  if (!result.canceled) {
    // Save the playlist with full paths
    const fs = require('fs');
    fs.writeFileSync(result.filePath, JSON.stringify(playlist, null, 2));
    return true;
  }
  return false;
});

// Handle load playlist
ipcMain.handle('load-playlist', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Load Playlist',
    filters: [
      { name: 'JSON Files', extensions: ['json'] }
    ],
    properties: ['openFile']
  });
  if (!result.canceled) {
    const fs = require('fs');
    const data = fs.readFileSync(result.filePaths[0], 'utf8');
    return JSON.parse(data);
  }
  return null;
});
