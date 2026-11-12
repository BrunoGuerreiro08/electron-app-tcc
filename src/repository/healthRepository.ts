import { parseServerHealth, type ServerHealth } from '../../shared/serverUrl'

/** Null when unreachable or when whatever answers isn't a Docenti server. */
export async function checkServerHealth(baseUrl: string, timeoutMs = 3000): Promise<ServerHealth | null> {
    try {
        const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) })
        if (!res.ok) return null
        return parseServerHealth(await res.json())
    } catch {
        return null
    }
}
