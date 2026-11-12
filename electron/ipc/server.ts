import { ipcMain } from 'electron'
import { getServerConfig, loadSession, saveSession, setServerConfig } from '../store'
import { probeServer } from '../server'
import { EMPTY_SERVER_INFO, normalizeServerUrl, type ServerConfig, type ServerSetResult } from '../../shared/serverUrl'
import { syncOfficialTemplates } from '../templates'
import { resetSyncStatus, syncNow } from '../sync/engine'

export function registerServerHandlers() {
    ipcMain.handle('server:get', () => getServerConfig())

    ipcMain.handle('server:probe', (_event, input: string) => probeServer(input))

    ipcMain.handle('server:set', async (_event, input: string): Promise<ServerSetResult> => {
        const url = normalizeServerUrl(input)
        if (!url) return { ok: false, reason: 'invalid-url' }

        const probe = await probeServer(url)
        const session = loadSession()
        const account = session && !session.isGuest ? session : null

        if (!probe.ok) {
            // Logged in, an unverifiable server could be a different one: refuse.
            // Logged out there's no token at stake, so allow configuring offline.
            if (account) return probe
            const config: ServerConfig = { url, serverId: null, ...EMPTY_SERVER_INFO }
            setServerConfig(config)
            return { ok: true, config }
        }

        // A different server: the renderer must log out first (the old token never goes there).
        if (account?.serverId && account.serverId !== probe.serverId) {
            return { ok: false, reason: 'requires-logout' }
        }

        const config: ServerConfig = {
            url,
            serverId: probe.serverId,
            institutionName: probe.institutionName,
            allowedEmailDomains: probe.allowedEmailDomains,
        }
        setServerConfig(config)
        // Session from before servers had identities: there was only ever one server.
        if (account && !account.serverId) saveSession({ ...account, serverId: probe.serverId })

        resetSyncStatus()
        void syncNow()
        void syncOfficialTemplates()
        return { ok: true, config }
    })
}
