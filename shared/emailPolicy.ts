/** "utfpr.edu.br, @alunos.x.br" → ['utfpr.edu.br', 'alunos.x.br']. Unset or blank → [] (no restriction). */
export function parseEmailDomains(raw: string | undefined): string[] {
    return (raw ?? '')
        .split(',')
        .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
        .filter(Boolean)
}

/** ['a.br', 'b.br'] → "@a.br, @b.br" */
export function formatDomains(domains: string[]): string {
    return domains.map((d) => `@${d}`).join(', ')
}

/**
 * An empty list allows any email. Otherwise the domain must match exactly or
 * be a dot-separated subdomain — never a plain suffix, so "evilutfpr.edu.br"
 * and "utfpr.edu.br.evil.com" are both rejected.
 */
export function isEmailAllowed(email: string, domains: string[]): boolean {
    if (domains.length === 0) return true
    const domain = email.trim().toLowerCase().slice(email.trim().lastIndexOf('@') + 1)
    return domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`))
}
