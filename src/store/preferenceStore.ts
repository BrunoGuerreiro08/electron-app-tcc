import { create } from 'zustand'
import i18n from 'i18next'

type Language = 'en' | 'pt-BR'
type Theme = 'light' | 'dark' | 'system'

interface PreferencesState {
    language: Language
    theme: Theme
    loading: boolean
    error: string | null
    load: () => Promise<void>
    setLanguage: (language: Language) => Promise<void>
    setTheme: (theme: Theme) => Promise<void>
}

// Must match DEFAULT_PREFERENCES in electron/store.ts.
const DEFAULT_LANGUAGE: Language = 'pt-BR'
const DEFAULT_THEME: Theme = 'system'

export const usePreferencesStore = create<PreferencesState>((set) => ({
    language: DEFAULT_LANGUAGE,
    theme: DEFAULT_THEME,
    loading: true,
    error: null,

    // Called once at boot, before the first render. Preferences are a device
    // setting, so this works before login; on any failure the defaults apply.
    load: async () => {
        set({ loading: true })
        try {
            const prefs = await window.api.preferences.get()
            await i18n.changeLanguage(prefs.language)
            set({ language: prefs.language, theme: prefs.theme, loading: false })
        } catch {
            await i18n.changeLanguage(DEFAULT_LANGUAGE).catch(() => {})
            set({ loading: false })
        }
    },

    setLanguage: async (language) => {
        set({ language, error: null })
        try {
            await i18n.changeLanguage(language)
            await window.api.preferences.setLanguage(language)
        } catch (err) {
            set({ error: (err as Error).message })
        }
    },

    setTheme: async (theme) => {
        set({ theme, error: null })
        try {
            await window.api.preferences.setTheme(theme)
        } catch (err) {
            set({ error: (err as Error).message })
        }
    },
}))
