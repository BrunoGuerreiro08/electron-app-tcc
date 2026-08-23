import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import { createSession, findOrCreateUser, updateUserName } from '../db.js'
import { clearOtp, getOtp, storeOtp } from '../redis.js'
import { sendOtpEmail } from '../mailer.js'
import { requireAuth, type AuthedVariables } from '../middleware.js'

export const authRoutes = new Hono<{ Variables: AuthedVariables }>()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24h

function randomCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString()
}

authRoutes.post('/request-otp', async (c) => {
    const body = await c.req.json<{ email?: string; lang?: 'pt' | 'en' }>()
    const email = body.email?.trim().toLowerCase()

    if (!email || !EMAIL_RE.test(email)) {
        return c.json({ error: 'Enter a valid email address.' }, 400)
    }

    const acceptLang = c.req.header('accept-language') ?? ''
    const preferredLang = body.lang ?? (acceptLang.includes('en') ? 'en' : 'pt')

    const code = randomCode()
    await storeOtp(email, code)

    await sendOtpEmail(email, code, preferredLang)

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

    const { user, isNew } = await findOrCreateUser(email)
    const token = randomUUID()
    const issuedAt = new Date()
    const expiresAt = new Date(issuedAt.getTime() + SESSION_TTL_MS)

    await createSession(user.id, token, expiresAt)

    return c.json({
        user,
        isNewUser: isNew,
        token,
        issuedAt: issuedAt.getTime(),
        expiresAt: expiresAt.getTime(),
    })
})

/**
 * Completes first-time onboarding by setting the user's display name.
 * Requires a valid session token — issued by /verify-otp, even for a
 * brand-new user, so the client can call this right after signing in
 * for the first time.
 */
authRoutes.post('/complete-profile', requireAuth, async (c) => {
    const user = c.get('user')
    const body = await c.req.json<{ name?: string }>()
    const name = body.name?.trim()

    if (!name) {
        return c.json({ error: 'Name is required.' }, 400)
    }

    const updated = await updateUserName(user.id, name)
    return c.json({ user: updated })
})