import { formatDomains, isEmailAllowed, parseEmailDomains } from '../../shared/emailPolicy.js'

// Which addresses may sign in is per institution (NFR-14-01). Comma-separated;
// each entry also admits its subdomains. Unset → any email.
export const ALLOWED_EMAIL_DOMAINS = parseEmailDomains(process.env.ALLOWED_EMAIL_DOMAINS)

export const INSTITUTION_NAME = process.env.INSTITUTION_NAME?.trim() || null

export const DOMAIN_ERROR = `Use your institutional email (${formatDomains(ALLOWED_EMAIL_DOMAINS)}).`

export function isAllowedEmail(email: string): boolean {
    return isEmailAllowed(email, ALLOWED_EMAIL_DOMAINS)
}
