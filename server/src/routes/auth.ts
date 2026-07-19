import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { createSession, findOrCreateUser } from '../db.js'
import { clearOtp, getOtp, storeOtp } from '../redis.js'
import { sendOtpEmail } from '../mailer.js'

export const authRoutes = new Hono()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24h

function randomCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
}

authRoutes.post('/request-otp', async (c) => {
    const body = await c.req.json<{ email?: string }>()
    const email = body.email?.trim().toLowerCase()

    if (!email || !EMAIL_RE.test(email)) {
        return c.json({ error: 'Enter a valid email address.' }, 400)
    }

    const code = randomCode()
    await storeOtp(email, code)
    await sendOtpEmail(email, code)

    return c.json({ ok: true })
})

authRoutes.post('/verify-otp', async (c) => {
    const body = await c.req.json<{ email?: string; code?: string }>()
    const email = body.email?.trim().toLowerCase()
    const code = body.code?.trim()

    if (!email || !code) {
        return c.json({ error: 'Email and code are required.' }, 400)
    }

    const stored = await getOtp(email)
    if (!stored) {
        return c.json({ error: 'Request a new code first.' }, 400)
    }
    if (stored !== code) {
        return c.json({ error: 'Incorrect code.' }, 400)
    }

    await clearOtp(email)

    const userId = await findOrCreateUser(email)
    const token = randomUUID()
    const issuedAt = new Date()
    const expiresAt = new Date(issuedAt.getTime() + SESSION_TTL_MS)

    await createSession(userId, token, expiresAt)

    return c.json({
        email,
        token,
        issuedAt: issuedAt.getTime(),
        expiresAt: expiresAt.getTime(),
    })
})