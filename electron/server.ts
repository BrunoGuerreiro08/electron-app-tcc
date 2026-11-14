import { getServerConfig, type SessionRecord } from './store'
import { normalizeServerUrl, parseServerHealth, pickServerInfo, type ServerProbeResult } from '../shared/serverUrl'

const PROBE_TIMEOUT_MS = 5000

export class NoServerConfiguredError extends Error {
    constructor() {
        super('No server configured.')
    }
}

export class ServerMismatchError extends Error {
    constructor() {
        super('The configured server is not the one this session was issued by.')
    }
}

export async function probeServer(input: string): Promise<ServerProbeResult> {
    const url = normalizeServerUrl(input)
    if (!url) return { ok: false, reason: 'invalid-url' }

    let res: Response
    try {
        res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) })
    } catch {
        return { ok: false, reason: 'unreachable' }
    }
    const health = res.ok ? parseServerHealth(await res.json().catch(() => null)) : null
    if (!health) return { ok: false, reason: 'not-docenti' }
    return { ok: true, url, serverId: health.serverId, ...pickServerInfo(health) }
}

/** Base URL for unauthenticated requests (e.g. official templates). */
export function getServerUrl(): string {
    const config = getServerConfig()
    if (!config) throw new NoServerConfiguredError()
    return config.url
}

/**
 * The only way the main process sends a token. Refuses unless the session
 * was issued by the configured server, so a URL change can never hand one
 * server's token to another.
 */
export function authorizedFetch(
    session: SessionRecord,
    path: string,
    init: { method?: string; body?: string; signal?: AbortSignal } = {}
): Promise<Response> {
    const config = getServerConfig()
    if (!config) throw new NoServerConfiguredError()
    if (!session.serverId || session.serverId !== config.serverId) throw new ServerMismatchError()

    return fetch(`${config.url}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
    })
}
