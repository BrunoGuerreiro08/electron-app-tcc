import { safeSupportEmail, safeSupportUrl } from '../../shared/serverUrl.js'

// Who runs this server, shown in the app's login and Support screens.
export const INSTITUTION_NAME = process.env.INSTITUTION_NAME?.trim() || null

export const SUPPORT_EMAIL = safeSupportEmail(process.env.SUPPORT_EMAIL)
export const SUPPORT_URL = safeSupportUrl(process.env.SUPPORT_URL)

/** Settings that were set but rejected, to warn about at startup. */
export function institutionWarnings(): string[] {
    const warnings: string[] = []
    if (process.env.SUPPORT_EMAIL?.trim() && !SUPPORT_EMAIL) warnings.push('SUPPORT_EMAIL is not a valid email — not published.')
    if (process.env.SUPPORT_URL?.trim() && !SUPPORT_URL) warnings.push('SUPPORT_URL must be an http(s) URL — not published.')
    return warnings
}
