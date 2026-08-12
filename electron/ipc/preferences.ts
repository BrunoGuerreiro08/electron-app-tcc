import { ipcMain } from 'electron'
import { getPreferences, setLanguage, setTheme } from '../store'

export function registerPreferencesHandlers() {
    ipcMain.handle('preferences:get', () => {
        return getPreferences()
    })

    ipcMain.handle('preferences:setLanguage', (_event, language: 'en' | 'pt-BR') => {
        setLanguage(language)
    })

    ipcMain.handle('preferences:setTheme', (_event, theme: 'light' | 'dark') => {
        setTheme(theme)
    })
}