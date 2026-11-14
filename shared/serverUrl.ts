/** Per-institution details a server publishes. */
export interface ServerInfo {
    institutionName: string | null
    /** Empty = any email may sign in. */
    allowedEmailDomains: string[]
    supportEmail: string | null
    /** Always http(s) — see safeSupportUrl. */
    supportUrl: string | null
}

export const EMPTY_SERVER_INFO: ServerInfo = {
    institutionName: null,
    allowedEmailDomains: [],
    supportEmail: null,
    supportUrl: null,
}

/** The single place that lists ServerInfo's fields, so a new one can't be dropped on copy. */
export function pickServerInfo(source: ServerInfo): ServerInfo {
    return {
        institutionName: source.institutionName,
        allowedEmailDomains: source.allowedEmailDomains,
        supportEmail: source.supportEmail,
        supportUrl: source.supportUrl,
    }
}

/** The app opens this link, so only http(s) is accepted — never file:, javascript: etc. */
export function safeSupportUrl(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null
    try {
        const url = new URL(value.trim())
        return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
    } catch {
        return null
    }
}

export function safeSupportEmail(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const email = value.trim()
    return /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[^\s@<>()"',;:]+$/.test(email) ? email : null
}

/** What a Docenti server answers on GET /health. */
export interface ServerHealth extends ServerInfo {
    ok: true
    app: 'docenti'
    serverId: string
    apiVersion: number
}

export type ServerProbeResult =
    | ({ ok: true; url: string; serverId: string } & ServerInfo)
    | { ok: false; reason: 'invalid-url' | 'unreachable' | 'not-docenti' }

export interface ServerConfig extends ServerInfo {
    url: string
    /** Null when saved while logged out without being reachable. */
    serverId: string | null
}

export type ServerSetResult =
    | { ok: true; config: ServerConfig }
    | { ok: false; reason: 'invalid-url' | 'unreachable' | 'not-docenti' | 'requires-logout' }

const SCHEME =/^[a-z][a-z0-9+.-]*:\/\//i

function isLocalHost(hostname: string): boolean {
    const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
    return host === 'localhost' || host === '::1' || host.endsWith('.local') || /^127\./.test(host)
}

function isPrivateHost(hostname: string): boolean {
    return (
        isLocalHost(hostname) ||
        /^10\./.test(hostname) ||
        /^192\.168\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    )
}

/**
 * Turns what the user typed into a canonical base URL (no trailing slash,
 * path prefix kept for reverse proxies), or null when it can't be one.
 * Without a scheme, LAN/loopback hosts get http and anything else https.
 */
export function normalizeServerUrl(input: string): string | null {
    const trimmed = input.trim()
    if (!trimmed) return null

    let candidate = trimmed
    if (!SCHEME.test(candidate)) {
        let hostname: string
        try {
            hostname = new URL(`http://${candidate}`).hostname
        } catch {
            return null
        }
        candidate = `${isPrivateHost(hostname) ? 'http' : 'https'}://${candidate}`
    }

    let url: URL
    try {
        url = new URL(candidate)
    } catch {
        return null
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!url.hostname || url.username || url.password || url.search || url.hash) return null

    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

/** Plain HTTP to anything but this machine: OTP codes and tokens travel unencrypted. */
export function isInsecureRemoteUrl(url: string): boolean {
    try {
        const parsed = new URL(url)
        return parsed.protocol === 'http:' && !isLocalHost(parsed.hostname)
    } catch {
        return false
    }
}

// The id names a local cache folder, so anything but a UUID is rejected (no path tricks).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Only the identity fields are required; info fields may be absent (older servers). */
export function isServerHealth(body: unknown): boolean {
    const b = body as Partial<ServerHealth> | null
    return !!b && b.ok === true && b.app === 'docenti' && typeof b.serverId === 'string' && UUID.test(b.serverId)
}

/** Validates and normalizes a /health body; null when it isn't a Docenti server. */
export function parseServerHealth(body: unknown): ServerHealth | null {
    if (!isServerHealth(body)) return null
    const b = body as Partial<ServerHealth> & { serverId: string }
    const name = typeof b.institutionName === 'string' ? b.institutionName.trim() : ''
    return {
        ok: true,
        app: 'docenti',
        serverId: b.serverId,
        apiVersion: typeof b.apiVersion === 'number' ? b.apiVersion : 1,
        institutionName: name || null,
        allowedEmailDomains: Array.isArray(b.allowedEmailDomains)
            ? b.allowedEmailDomains.filter((d): d is string => typeof d === 'string' && d.length > 0)
            : [],
        supportEmail: safeSupportEmail(b.supportEmail),
        supportUrl: safeSupportUrl(b.supportUrl),
    }
}
