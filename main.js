const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 800,
    autoHideMenuBar: true,
    menubarvisibility: false,
    resizable: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
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

// Handle file existence check
ipcMain.handle('check-file-exists', async (event, filePath) => {
  const fs = require('fs');
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
});

// Handle getting file data
ipcMain.handle('get-file-data', async (event, filePath) => {
  const fs = require('fs');
  try {
    const data = await fs.promises.readFile(filePath);
    return data;
  } catch (error) {
    console.error('Error reading file:', error);
    return null;
  }
});

// Handle save playlist
ipcMain.handle('save-playlist', async (event, playlist) => {
  const result = await dialog.showSaveDialog({
    title: 'Save Playlist',
    defaultPath: 'playlist.json',
    filters: [
      { name: 'JSON Files', extensions: ['json'] }
    ],
    properties: ['createDirectory', 'showOverwriteConfirmation']
  });
  if (!result.canceled && result.filePath) {
    // Validate playlist data and use original paths
    const playlistWithPaths = playlist.map(song => {
      if (!song || !song.path) {
        throw new Error('Invalid song data: missing path');
      }
      return {
        name: song.name,
        path: song.path // Use the original path without resolving
      };
    });
    
    const fs = require('fs');
    try {
      fs.writeFileSync(result.filePath, JSON.stringify(playlistWithPaths, null, 2));
      return true;
    } catch (error) {
      console.error('Error saving playlist:', error);
      throw error;
    }
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
    const playlist = JSON.parse(data);
    
    // Validate playlist data and ensure all paths are absolute
    const playlistWithAbsolutePaths = playlist.map(song => {
      if (!song || !song.path) {
        throw new Error('Invalid song data: missing path');
      }
      return {
        ...song,
        path: path.resolve(song.path)
      };
    });
    
    return playlistWithAbsolutePaths;
  }
  return null;
});
