import Store from 'electron-store'
import path from 'node:path'
import { app } from 'electron'

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

// --- Global store -----------------------------------------------------
// Deliberately the ONLY thing that lives outside `users/<userId>/`.
// Holds just enough to know who's logged in on this device, so it can be
// read before any user db/store is open (e.g. to restore a session at
// app startup). Nothing user-specific belongs here — that's what keeps
// isolation "full" rather than "mostly". In particular, `storageFolder`
// is NOT here: it's a per-user choice (see below), not a device setting.
interface GlobalStoreSchema {
    session: SessionRecord | null
}

export const globalStore = new Store<GlobalStoreSchema>({
    name: 'global-config',
    defaults: {
        session: null,
    },
})

// --- Per-user store -----------------------------------------------------
// Instantiated on login, pointed at that user's own folder via `cwd`.
// electron-store creates `<cwd>/settings.json` — never touches or reads
// any other user's folder.
//
// `storageFolder` lives here rather than in the global store because it's
// a per-user override (e.g. "sync my certs into my own Drive folder").
// If it were global, user B logging in on the same machine would silently
// inherit — or worse, overwrite — user A's chosen folder.
interface UserStoreSchema {
    preferences: Preferences
    storageFolder: string | null // null = use the default per-user app-data location
}

let userStore: Store<UserStoreSchema> | null = null
let activeUserId: string | null = null

export function openUserStore(userId: string): Store<UserStoreSchema> {
    if (userStore && activeUserId === userId) return userStore

    userStore = new Store<UserStoreSchema>({
        name: 'settings',
        cwd: path.join(app.getPath('userData'), 'users', userId),
        defaults: { preferences: DEFAULT_PREFERENCES, storageFolder: null },
    })
    activeUserId = userId
    return userStore
}

export function closeUserStore(): void {
    userStore = null
    activeUserId = null
}

function requireUserStore(): Store<UserStoreSchema> {
    if (!userStore) {
        throw new Error('No active user store — call openUserStore() after login first.')
    }
    return userStore
}

export function getPreferences(): Preferences {
    return requireUserStore().get('preferences', DEFAULT_PREFERENCES)
}

export function setLanguage(language: Preferences['language']): void {
    requireUserStore().set('preferences.language', language)
}

export function setTheme(theme: Preferences['theme']): void {
    requireUserStore().set('preferences.theme', theme)
}

export function getConfiguredStorageFolder(): string | null {
    return requireUserStore().get('storageFolder', null)
}

export function setConfiguredStorageFolder(folder: string | null): void {
    requireUserStore().set('storageFolder', folder)
}