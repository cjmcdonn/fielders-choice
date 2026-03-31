import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { readFile, writeFile } from 'fs/promises'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    title: "Fielder's Choice",
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.fielderschoice')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC: Save game
  ipcMain.handle('save-game', async (_event, gameJson: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Game',
      defaultPath: 'game.json',
      filters: [{ name: 'JSON Files', extensions: ['json'] }]
    })
    if (!canceled && filePath) {
      await writeFile(filePath, gameJson, 'utf-8')
      return filePath
    }
    return null
  })

  // IPC: Load game
  ipcMain.handle('load-game', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Open Game',
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
      properties: ['openFile']
    })
    if (!canceled && filePaths.length > 0) {
      const content = await readFile(filePaths[0], 'utf-8')
      return content
    }
    return null
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
