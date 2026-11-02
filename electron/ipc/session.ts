import { ipcMain } from 'electron'
import { loadSession, saveSession, openUserStore, closeUserStore, migrateLegacyPreferences, type SessionRecord } from '../store'
import { openUserDb, closeUserDb, getActiveUserId } from '../db'
import { detectOrphans } from '../fileHandler'
import { syncOfficialTemplates } from '../templates'
import { setSyncRecording } from '../sync/recorder'
import { resetSyncStatus, syncNow } from '../sync/engine'

export function registerSessionHandlers() {
    ipcMain.handle('session:get', () => {
        const session = loadSession()
        if (!session || getActiveUserId() === session.user.id) return session

        // Startup restore failed (see restoreActiveSession) — retry once so a
        // transient failure doesn't strand the user. If it still fails, report
        // no session so the renderer shows the login screen instead of a
        // dashboard with no db behind it.
        return tryOpenUser(session) ? session : null
    })

    ipcMain.handle('session:set', (_event, session: SessionRecord) => {
        saveSession(session)

        // This is the isolation boundary: everything after this line reads
        // from and writes to users/<session.user.id>/ only.
        openUserDb(session.user.id)
        openUserStore(session.user.id)
        // Guests never sync, so their changes aren't queued for the server.
        setSyncRecording(session.isGuest !== true)

        // Re-run orphan detection against the newly active user's files/ dir —
        // relevant on account switch, not just first login.
        detectOrphans()

        // First chance to fetch official templates when the app started on
        // the login screen. Skipped internally for guest sessions.
        void syncOfficialTemplates()

        resetSyncStatus()
        void syncNow()
    })

    // Token refresh / profile edit for the user who is already active: only
    // the stored record changes, so skip reopening the db and the orphan scan.
    ipcMain.handle('session:update', (_event, session: SessionRecord) => {
        if (session.user.id !== getActiveUserId()) {
            throw new Error('session:update can only change the active user\'s session.')
        }
        saveSession(session)
        // Usually a renewed token: retry a sync that the old one got refused.
        void syncNow()
    })

    ipcMain.handle('session:clear', () => {
        saveSession(null)
        setSyncRecording(false)
        resetSyncStatus()
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
    return tryOpenUser(session) ? session : null
}

function tryOpenUser(session: SessionRecord): boolean {
    try {
        openUserDb(session.user.id)
        openUserStore(session.user.id)
        setSyncRecording(session.isGuest !== true)
        return true
    } catch (err) {
        console.error('[session] failed to open user db/store:', err)
        closeUserDb()
        closeUserStore()
        return false
    }
}