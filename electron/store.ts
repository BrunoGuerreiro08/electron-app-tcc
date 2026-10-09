import Store from 'electron-store'
import fs from 'node:fs'
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
    theme: 'light' | 'dark' | 'system'
}

const DEFAULT_PREFERENCES: Preferences = {
    language: 'pt-BR',
    theme: 'system',
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

// --- Device preferences store ------------------------------------------
// Language/theme are a device setting, not a per-user one: they must be
// readable on the login screen, before any user db/store is open, and even
// if SQLite or the user folder is broken (NFR-10-01, NFR-10-02). Kept in its
// own file so `global-config` stays session-only.
//
// Opened lazily and never allowed to throw: if the file can't be read or
// written, preferences fall back to an in-memory copy for this run.
const PREFERENCES_STORE_NAME = 'preferences'

let prefsStore: Store<Preferences> | null = null
let memoryPreferences: Preferences = { ...DEFAULT_PREFERENCES }

function getPrefsStore(): Store<Preferences> | null {
    if (prefsStore) return prefsStore
    try {
        prefsStore = new Store<Preferences>({
            name: PREFERENCES_STORE_NAME,
            defaults: DEFAULT_PREFERENCES,
            clearInvalidConfig: true,
        })
    } catch (err) {
        console.warn('[preferences] store unavailable, using in-memory defaults:', err)
    }
    return prefsStore
}

export function getPreferences(): Preferences {
    try {
        const store = getPrefsStore()
        if (store) return { ...DEFAULT_PREFERENCES, ...store.store }
    } catch (err) {
        console.warn('[preferences] read failed, using in-memory copy:', err)
    }
    return memoryPreferences
}

function setPreference<K extends keyof Preferences>(key: K, value: Preferences[K]): void {
    memoryPreferences = { ...memoryPreferences, [key]: value }
    try {
        getPrefsStore()?.set(key, value)
    } catch (err) {
        console.warn(`[preferences] failed to persist ${key}:`, err)
    }
}

export function setLanguage(language: Preferences['language']): void {
    setPreference('language', language)
}

export function setTheme(theme: Preferences['theme']): void {
    setPreference('theme', theme)
}

/**
 * One-time migration: preferences used to live in each user's settings.json.
 * If the device file doesn't exist yet, seed it from the last active user's
 * legacy values. Reads the JSON directly so it doesn't depend on the user
 * store being openable. Must run before the preferences store is first opened.
 */
export function migrateLegacyPreferences(userId: string): void {
    try {
        const userData = app.getPath('userData')
        if (fs.existsSync(path.join(userData, `${PREFERENCES_STORE_NAME}.json`))) return

        const legacyPath = path.join(userData, 'users', userId, 'settings.json')
        if (!fs.existsSync(legacyPath)) return

        const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'))?.preferences
        if (!legacy) return
        if (legacy.language === 'en' || legacy.language === 'pt-BR') setLanguage(legacy.language)
        if (legacy.theme === 'light' || legacy.theme === 'dark') setTheme(legacy.theme)
    } catch (err) {
        console.warn('[preferences] legacy migration skipped:', err)
    }
}

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
    storageFolder: string | null // null = use the default per-user app-data location
}

let userStore: Store<UserStoreSchema> | null = null
let activeUserId: string | null = null

export function openUserStore(userId: string): Store<UserStoreSchema> {
    if (userStore && activeUserId === userId) return userStore

    userStore = new Store<UserStoreSchema>({
        name: 'settings',
        cwd: path.join(app.getPath('userData'), 'users', userId),
        defaults: { storageFolder: null },
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

export function getConfiguredStorageFolder(): string | null {
    return requireUserStore().get('storageFolder', null)
}

export function setConfiguredStorageFolder(folder: string | null): void {
    requireUserStore().set('storageFolder', folder)
}
