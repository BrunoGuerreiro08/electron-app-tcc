import { describe, expect, it } from 'vitest'
import { formatDomains, isEmailAllowed, parseEmailDomains } from '../../shared/emailPolicy'

// Each server sets its own ALLOWED_EMAIL_DOMAINS (NFR-14-01).
describe('isEmailAllowed', () => {
    const utfpr = ['utfpr.edu.br']

    it.each(['prof@utfpr.edu.br', 'aluno@alunos.utfpr.edu.br', 'x@a.b.utfpr.edu.br', ' Prof@UTFPR.edu.br '])(
        'accepts %s',
        (email) => {
            expect(isEmailAllowed(email, utfpr)).toBe(true)
        }
    )

    it.each(['x@gmail.com', 'x@evilutfpr.edu.br', 'x@utfpr.edu.br.evil.com', 'x@edu.br'])('rejects %s', (email) => {
        expect(isEmailAllowed(email, utfpr)).toBe(false)
    })

    it('accepts any of several domains', () => {
        expect(isEmailAllowed('a@ufpr.br', ['utfpr.edu.br', 'ufpr.br'])).toBe(true)
    })

    it('accepts any email when no domains are configured', () => {
        expect(isEmailAllowed('anyone@gmail.com', [])).toBe(true)
    })
})

describe('parseEmailDomains', () => {
    it('normalizes a comma-separated list', () => {
        expect(parseEmailDomains(' @A.com , b.org,, ')).toEqual(['a.com', 'b.org'])
    })

    it.each([undefined, '', '  ,  '])('treats %j as no restriction', (raw) => {
        expect(parseEmailDomains(raw)).toEqual([])
    })
})

describe('formatDomains', () => {
    it('prefixes each domain with @', () => {
        expect(formatDomains(['a.br', 'b.br'])).toBe('@a.br, @b.br')
    })
})
