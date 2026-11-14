import { useMemo } from 'react'
import { create } from 'zustand'
import { checkServerHealth } from '@/repository/healthRepository'
import { useServerConfigStore } from '@/store/serverConfigStore'
import { EMPTY_SERVER_INFO, type ServerHealth, type ServerInfo } from '../../shared/serverUrl'

/**
 * - unconfigured: no server URL saved yet
 * - mismatch:     the server at the saved URL has another identity than the
 *                 one saved (reinstalled, or the address now points elsewhere)
 */
export type ServerStatus = 'checking' | 'online' | 'offline' | 'unconfigured' | 'mismatch'

interface ServerStatusState {
    status: ServerStatus
    /** Latest /health answer from the configured URL; null when unreachable. */
    health: ServerHealth | null
    lastCheckedAt: number | null
    check: () => Promise<void>
    startPolling: (intervalMs?: number) => () => void
}

export const useServerStatusStore = create<ServerStatusState>((set, get) => ({
    status: 'checking',
    health: null,
    lastCheckedAt: null,

    check: async () => {
        const configStore = useServerConfigStore.getState()
        if (!configStore.loaded) await configStore.load()
        const config = useServerConfigStore.getState().config
        if (!config) {
            set({ status: 'unconfigured', health: null, lastCheckedAt: Date.now() })
            return
        }

        const health = await checkServerHealth(config.url)
        // The URL may have changed while this request was in flight.
        if (useServerConfigStore.getState().config?.url !== config.url) return

        let status: ServerStatus = 'offline'
        if (health) status = config.serverId && health.serverId !== config.serverId ? 'mismatch' : 'online'
        set({ status, health, lastCheckedAt: Date.now() })

        // Saved while unreachable: record its identity now (the main process
        // re-verifies, and refuses if it would cross servers mid-session).
        if (health && !config.serverId) void useServerConfigStore.getState().save(config.url)
    },

    startPolling: (intervalMs = 30_000) => {
        get().check()
        const id = setInterval(() => {
            get().check()
        }, intervalMs)
        return () => clearInterval(id)
    },
}))

/**
 * Institution name and allowed email domains: live from the server when it's
 * online (so policy changes show up), else what was saved with the URL.
 */
export function useServerInfo(): ServerInfo {
    const config = useServerConfigStore((s) => s.config)
    const status = useServerStatusStore((s) => s.status)
    const health = useServerStatusStore((s) => s.health)
    const source = status === 'online' && health ? health : config
    const institutionName = source?.institutionName ?? EMPTY_SERVER_INFO.institutionName
    const allowedEmailDomains = source?.allowedEmailDomains ?? EMPTY_SERVER_INFO.allowedEmailDomains
    return useMemo(() => ({ institutionName, allowedEmailDomains }), [institutionName, allowedEmailDomains])
}

// A new URL takes effect right away instead of at the next poll.
useServerConfigStore.subscribe((state, prev) => {
    if (state.config !== prev.config) void useServerStatusStore.getState().check()
})
