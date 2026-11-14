import type { ServerConfig, ServerProbeResult, ServerSetResult } from '../../shared/serverUrl'

export const serverRepository = {
    get: (): Promise<ServerConfig | null> => window.api.server.get(),
    probe: (url: string): Promise<ServerProbeResult> => window.api.server.probe(url),
    set: (url: string): Promise<ServerSetResult> => window.api.server.set(url),
}
