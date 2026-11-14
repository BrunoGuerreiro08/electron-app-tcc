import { create } from 'zustand'
import { serverRepository } from '@/repository/serverRepository'
import type { Session } from '@/types/auth'
import type { ServerConfig, ServerProbeResult, ServerSetResult } from '../../shared/serverUrl'

export class NoServerConfiguredError extends Error {
    constructor() {
        super('No server configured.')
        this.name = 'NoServerConfiguredError'
    }
}

export class ServerMismatchError extends Error {
    constructor() {
        super('The configured server is not the one this session was issued by.')
        this.name = 'ServerMismatchError'
    }
}

interface ServerConfigState {
    config: ServerConfig | null
    loaded: boolean
    load: () => Promise<void>
    probe: (url: string) => Promise<ServerProbeResult>
    save: (url: string) => Promise<ServerSetResult>
}

export const useServerConfigStore = create<ServerConfigState>((set) => ({
    config: null,
    loaded: false,

    load: async () => {
        set({ config: await serverRepository.get(), loaded: true })
    },

    probe: (url) => serverRepository.probe(url),

    save: async (url) => {
        const result = await serverRepository.set(url)
        if (result.ok) set({ config: result.config, loaded: true })
        return result
    },
}))

export function apiBase(): string {
    const config = useServerConfigStore.getState().config
    if (!config) throw new NoServerConfiguredError()
    return config.url
}

/** Call before any request that carries `session.token`: never send it to another server. */
export function assertSameServer(session: Session): void {
    const serverId = useServerConfigStore.getState().config?.serverId
    if (!serverId || session.serverId !== serverId) throw new ServerMismatchError()
}

export function isSameServer(session: Session): boolean {
    try {
        assertSameServer(session)
        return true
    } catch {
        return false
    }
}
