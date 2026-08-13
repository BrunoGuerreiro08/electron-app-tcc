import { ipcMain } from 'electron'
import { globalStore, openUserStore, closeUserStore, type SessionRecord } from '../store'
import { openUserDb, closeUserDb } from '../db'
import { detectOrphans } from '../fileHandler'

export function registerSessionHandlers() {
    ipcMain.handle('session:get', () => {
        return globalStore.get('session')
    })

    ipcMain.handle('session:set', (_event, session: SessionRecord) => {
        globalStore.set('session', session)

        // This is the isolation boundary: everything after this line reads
        // from and writes to users/<session.user.id>/ only.
        openUserDb(session.user.id)
        openUserStore(session.user.id)

        // Re-run orphan detection against the newly active user's files/ dir —
        // relevant on account switch, not just first login.
        detectOrphans()
    })

    ipcMain.handle('session:clear', () => {
        globalStore.set('session', null)
        closeUserDb()
        closeUserStore()
    })
}

/**
 * Called once at app startup, before any window exists, to re-open the db
 * for whichever user was last logged in on this device (if any). Returns
 * the restored session so main.ts can decide whether to run startup tasks
 * like detectOrphans() that require an active user.
 */
export function restoreActiveSession(): SessionRecord | null {
    const session = globalStore.get('session')
    if (session) {
        openUserDb(session.user.id)
        openUserStore(session.user.id)
    }
    return session
}