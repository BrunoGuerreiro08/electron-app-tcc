import { create } from 'zustand'
import type { SyncStatus } from '../../shared/syncProtocol'
import { useServerStatusStore } from '@/store/serverStatusStore'

interface SyncStoreState {
    status: SyncStatus
    /**
     * Bumped whenever changes from another device were applied locally.
     * Screens that load data put it in their effect deps to reload.
     */
    dataVersion: number
    /** Subscribes to the main process; call once, returns the cleanup. */
    init: () => () => void
    syncNow: () => Promise<void>
    clearNotices: () => Promise<void>
}

export const useSyncStore = create<SyncStoreState>((set) => ({
    status: { state: 'disabled', pending: 0, lastSyncedAt: null, detachedRemotely: [] },
    dataVersion: 0,

    init: () => {
        window.api.sync.status().then((status) => set({ status }))
        const offStatus = window.api.sync.onStatus((status) => set({ status }))
        const offApplied = window.api.sync.onApplied(() => set((s) => ({ dataVersion: s.dataVersion + 1 })))

        // Back online: don't wait for the periodic run to push what queued up.
        const offServer = useServerStatusStore.subscribe((state, prev) => {
            if (state.status === 'online' && prev.status === 'offline') void window.api.sync.now()
        })

        return () => {
            offStatus()
            offApplied()
            offServer()
        }
    },

    syncNow: async () => {
        set({ status: await window.api.sync.now() })
    },

    clearNotices: async () => {
        await window.api.sync.clearNotices()
    },
}))
