import type { AuthRepository, Session } from '@/types/auth'

const pendingCodes = new Map<string, { code: string; expiresAt: number }>()

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function randomCode() {
    return Math.floor(100000 + Math.random() * 900000).toString()
}

export const mockAuthRepository: AuthRepository = {
    async requestCode(email: string) {
        await delay(500)

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            throw new Error('Enter a valid email address.')
        }

        const code = randomCode()
        pendingCodes.set(email, { code, expiresAt: Date.now() + 5 * 60_000 })

        // No real email backend yet — code is logged so the flow can be tested manually
        console.log(`[mock-auth] code for ${email}: ${code}`)
    },

    async verifyCode(email: string, code: string): Promise<Session> {
        await delay(500)

        const pending = pendingCodes.get(email)

        if (!pending) {
            throw new Error('Request a new code first.')
        }
        if (Date.now() > pending.expiresAt) {
            pendingCodes.delete(email)
            throw new Error('Code expired. Request a new one.')
        }
        if (pending.code !== code) {
            throw new Error('Incorrect code.')
        }

        pendingCodes.delete(email)

        const now = Date.now()
        return {
            email,
            token: crypto.randomUUID(),
            issuedAt: now,
            expiresAt: now + 24 * 60 * 60_000, // mock 24h TTL
        }
    },
}