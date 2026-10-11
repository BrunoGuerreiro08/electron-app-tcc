import { describe, expect, it } from 'vitest'
import { isAllowedEmail } from '../../server/src/emailPolicy'

// Default ALLOWED_EMAIL_DOMAINS = utfpr.edu.br (NFR-14-01).
describe('isAllowedEmail', () => {
    it.each(['prof@utfpr.edu.br', 'aluno@alunos.utfpr.edu.br', 'x@a.b.utfpr.edu.br'])('accepts %s', (email) => {
        expect(isAllowedEmail(email)).toBe(true)
    })

    it.each(['x@gmail.com', 'x@evilutfpr.edu.br', 'x@utfpr.edu.br.evil.com', 'x@edu.br'])('rejects %s', (email) => {
        expect(isAllowedEmail(email)).toBe(false)
    })
})
