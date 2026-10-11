import { ipcMain } from 'electron'
import { loadSession, saveSession, openUserStore, closeUserStore, migrateLegacyPreferences, type SessionRecord } from '../store'
import { openUserDb, closeUserDb, getActiveUserId } from '../db'
import { detectOrphans } from '../fileHandler'

export function registerSessionHandlers() {
    ipcMain.handle('session:get', () => {
        const session = loadSession()
        if (!session || getActiveUserId() === session.user.id) return session

        // Startup restore failed (see restoreActiveSession) — retry once so a
        // transient failure doesn't strand the user. If it still fails, report
        // no session so the renderer shows the login screen instead of a
        // dashboard with no db behind it.
        return tryOpenUser(session.user.id) ? session : null
    })

    ipcMain.handle('session:set', (_event, session: SessionRecord) => {
        saveSession(session)

        // This is the isolation boundary: everything after this line reads
        // from and writes to users/<session.user.id>/ only.
        openUserDb(session.user.id)
        openUserStore(session.user.id)

        // Re-run orphan detection against the newly active user's files/ dir —
        // relevant on account switch, not just first login.
        detectOrphans()
    })

    // Token refresh / profile edit for the user who is already active: only
    // the stored record changes, so skip reopening the db and the orphan scan.
    ipcMain.handle('session:update', (_event, session: SessionRecord) => {
        if (session.user.id !== getActiveUserId()) {
            throw new Error('session:update can only change the active user\'s session.')
        }
        saveSession(session)
    })

    ipcMain.handle('session:clear', () => {
        saveSession(null)
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
    const session = loadSession()
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