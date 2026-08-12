import Store from 'electron-store'

export interface SessionRecord {
    user: { id: string; email: string; name: string | null }
    token: string
    issuedAt: number
    expiresAt: number
}

export interface Preferences {
    language: 'en' | 'pt-BR'
    theme: 'light' | 'dark'
}

const DEFAULT_PREFERENCES: Preferences = {
    language: 'pt-BR',
    theme: 'light',
}

export function getPreferences(): Preferences {
    return store.get('preferences', DEFAULT_PREFERENCES)
}

export function setLanguage(language: Preferences['language']) {
    store.set('preferences.language', language)
}

export function setTheme(theme: Preferences['theme']) {
    store.set('preferences.theme', theme)
}

interface StoreSchema {
    session: SessionRecord | null
    storageFolder: string | null // null = use the default app-data location
    preferences: Preferences
}
export const store = new Store<StoreSchema>({
    defaults: {
        session: null,
        storageFolder: null,
        preferences: DEFAULT_PREFERENCES,
    },
})