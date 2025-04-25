const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args)
    },
    // Expose file path functionality using webUtils
    getFilePath: (file) => {
        return webUtils.getPathForFile(file);
    }
}); 