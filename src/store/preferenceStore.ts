import { create } from 'zustand'
import i18n from 'i18next'


interface PreferencesState {
    language: 'en' | 'pt-BR'
    theme: 'light' | 'dark'
    loading: boolean
    error: string | null
    load: () => Promise<void>
    setLanguage: (language: 'en' | 'pt-BR') => Promise<void>
    setTheme: (theme: 'light' | 'dark') => Promise<void>
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
    language: 'en',
    theme: 'light',
    loading: true,
    error: null,

    load: async () => {
        set({ loading: true })
        const prefs = await window.api.preferences.get()
        await i18n.changeLanguage(prefs.language)
        set({ language: prefs.language, theme: prefs.theme, loading: false })
    },

    setLanguage: async (language) => {
        set({ error: null })
        try {
            await i18n.changeLanguage(language)
            await window.api.preferences.setLanguage(language)
            set({ language })
        } catch (err) {
            set({ error: (err as Error).message })
        }
    },

    setTheme: async (theme) => {
        set({ error: null })
        try {
            await window.api.preferences.setTheme(theme)
            set({ theme })
        } catch (err) {
            set({ error: (err as Error).message })
        }
    },
}))