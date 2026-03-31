/// <reference types="vite/client" />

interface Window {
  electron: import('@electron-toolkit/preload').ElectronAPI
  api: {
    saveGame: (gameJson: string) => Promise<string | null>
    loadGame: () => Promise<string | null>
  }
}
