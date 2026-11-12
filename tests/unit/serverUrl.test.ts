import { describe, expect, it } from 'vitest'
import { isInsecureRemoteUrl, isServerHealth, normalizeServerUrl, parseServerHealth } from '../../shared/serverUrl'

describe('normalizeServerUrl', () => {
    it.each([
        ['localhost:3000', 'http://localhost:3000'],
        ['127.0.0.1:3000/', 'http://127.0.0.1:3000'],
        ['192.168.0.10:3000', 'http://192.168.0.10:3000'],
        ['10.1.2.3', 'http://10.1.2.3'],
        ['172.20.0.5:8080', 'http://172.20.0.5:8080'],
        ['docenti.utfpr.edu.br', 'https://docenti.utfpr.edu.br'],
        ['  https://docenti.utfpr.edu.br//  ', 'https://docenti.utfpr.edu.br'],
        ['http://docenti.utfpr.edu.br', 'http://docenti.utfpr.edu.br'],
        ['https://example.com/docenti/api/', 'https://example.com/docenti/api'],
        ['HTTPS://Example.COM', 'https://example.com'],
    ])('%s -> %s', (input, expected) => {
        expect(normalizeServerUrl(input)).toBe(expected)
    })

    it.each([
        '',
        '   ',
        'ftp://example.com',
        'javascript:alert(1)',
        'https://user:pass@example.com',
        'https://example.com/?x=1',
        'https://example.com/#frag',
        'http://',
    ])('rejects %j', (input) => {
        expect(normalizeServerUrl(input)).toBeNull()
    })

    it('does not treat 172.32.x as private', () => {
        expect(normalizeServerUrl('172.32.0.1')).toBe('https://172.32.0.1')
    })
})

describe('isInsecureRemoteUrl', () => {
    it.each(['http://192.168.0.10:3000', 'http://docenti.utfpr.edu.br'])('flags %s', (url) => {
        expect(isInsecureRemoteUrl(url)).toBe(true)
    })

    it.each(['https://docenti.utfpr.edu.br', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000'])(
        'allows %s',
        (url) => {
            expect(isInsecureRemoteUrl(url)).toBe(false)
        }
    )
})

describe('isServerHealth', () => {
    const valid = { ok: true, app: 'docenti', serverId: '3f2a9c1e-8b7d-4e6f-a5c4-1d2e3f4a5b6c', apiVersion: 1 }

    it('accepts a Docenti health response', () => {
        expect(isServerHealth(valid)).toBe(true)
    })

    it.each([
        ['the old response shape', { ok: true }],
        ['another app', { ...valid, app: 'other' }],
        ['a path-like id', { ...valid, serverId: '../../evil' }],
        ['an empty id', { ...valid, serverId: '' }],
        ['null', null],
        ['an HTML page', '<html></html>'],
    ])('rejects %s', (_label, body) => {
        expect(isServerHealth(body)).toBe(false)
    })
})

describe('parseServerHealth', () => {
    const base = { ok: true, app: 'docenti', serverId: '3f2a9c1e-8b7d-4e6f-a5c4-1d2e3f4a5b6c', apiVersion: 1 }

    it('reads the institution info', () => {
        const health = parseServerHealth({ ...base, institutionName: ' UTFPR ', allowedEmailDomains: ['utfpr.edu.br'] })
        expect(health?.institutionName).toBe('UTFPR')
        expect(health?.allowedEmailDomains).toEqual(['utfpr.edu.br'])
    })

    it('defaults the info fields for a server that does not send them', () => {
        expect(parseServerHealth(base)).toMatchObject({ institutionName: null, allowedEmailDomains: [] })
    })

    it('drops malformed info instead of rejecting the server', () => {
        const health = parseServerHealth({ ...base, institutionName: 42, allowedEmailDomains: ['ok.br', 7, ''] })
        expect(health).toMatchObject({ institutionName: null, allowedEmailDomains: ['ok.br'] })
    })

    it('returns null for a non-Docenti body', () => {
        expect(parseServerHealth({ ok: true })).toBeNull()
    })
})
