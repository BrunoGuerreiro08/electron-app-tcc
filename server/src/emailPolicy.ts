// Only institutional addresses may sign in (NFR-14-01). Comma-separated;
// each entry also admits its subdomains (utfpr.edu.br → alunos.utfpr.edu.br).
export const ALLOWED_EMAIL_DOMAINS = (process.env.ALLOWED_EMAIL_DOMAINS ?? 'utfpr.edu.br')
    .split(',')
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean)

export const DOMAIN_ERROR = `Use your institutional email (${ALLOWED_EMAIL_DOMAINS.map((d) => `@${d}`).join(', ')}).`

export function isAllowedEmail(email: string): boolean {
    const domain = email.slice(email.lastIndexOf('@') + 1)
    // Exact match or a dot-separated subdomain — never a plain suffix, so
    // "evilutfpr.edu.br" and "utfpr.edu.br.evil.com" are both rejected.
    return ALLOWED_EMAIL_DOMAINS.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`))
}
