import { ipcMain } from 'electron'
import { globalStore, openUserStore, closeUserStore, migrateLegacyPreferences, type SessionRecord } from '../store'
import { openUserDb, closeUserDb, getActiveUserId } from '../db'
import { detectOrphans } from '../fileHandler'

export function registerSessionHandlers() {
    ipcMain.handle('session:get', () => {
        const session = globalStore.get('session')
        if (!session || getActiveUserId() === session.user.id) return session

        // Startup restore failed (see restoreActiveSession) — retry once so a
        // transient failure doesn't strand the user. If it still fails, report
        // no session so the renderer shows the login screen instead of a
        // dashboard with no db behind it.
        return tryOpenUser(session.user.id) ? session : null
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
    if (!session) return null

    migrateLegacyPreferences(session.user.id)

    // A broken db or user folder must not stop the window from opening —
    // the renderer can still show the login screen with the device
    // preferences applied (NFR-10-02).
    return tryOpenUser(session.user.id) ? session : null
}

function tryOpenUser(userId: string): boolean {
    try {
        openUserDb(userId)
        openUserStore(userId)
        return true
    } catch (err) {
        console.error('[session] failed to open user db/store:', err)
        closeUserDb()
        closeUserStore()
        return false
    }
}