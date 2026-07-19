import { create } from 'zustand'

interface SettingsState {
    storageFolder: string | null
    isCustomFolder: boolean
    loading: boolean
    migrating: boolean
    error: string | null
    load: () => Promise<void>
    changeFolder: () => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
    storageFolder: null,
    isCustomFolder: false,
    loading: true,
    migrating: false,
    error: null,

    load: async () => {
        set({ loading: true })
        const { path, isCustom } = await window.api.settings.getStorageFolder()
        set({ storageFolder: path, isCustomFolder: isCustom, loading: false })
    },

    changeFolder: async () => {
        set({ error: null })
        const picked = await window.api.settings.pickStorageFolder()
        if (!picked) return // cancelled

        set({ migrating: true })
        try {
            const result = await window.api.settings.changeStorageFolder(picked)
            if (result.failed > 0) {
                set({ error: `${result.moved} file(s) moved, ${result.failed} failed. See logs.` })
            }
            set({ storageFolder: picked, isCustomFolder: true, migrating: false })
        } catch (err) {
            set({ error: (err as Error).message, migrating: false })
        }
    },
}))