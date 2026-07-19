import { create } from 'zustand'
import { checkServerHealth } from '@/repository/healthRepository'

export type ServerStatus = 'checking' | 'online' | 'offline'

interface ServerStatusState {
    status: ServerStatus
    lastCheckedAt: number | null
    check: () => Promise<void>
    startPolling: (intervalMs?: number) => () => void
}

export const useServerStatusStore = create<ServerStatusState>((set, get) => ({
    status: 'checking',
    lastCheckedAt: null,

    check: async () => {
        const ok = await checkServerHealth()
        set({ status: ok ? 'online' : 'offline', lastCheckedAt: Date.now() })
    },

    startPolling: (intervalMs = 30_000) => {
        get().check()
        const id = setInterval(() => {
            get().check()
        }, intervalMs)
        return () => clearInterval(id)
    },
}))