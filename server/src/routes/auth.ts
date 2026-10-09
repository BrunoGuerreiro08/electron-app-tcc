import { Hono } from 'hono'
import { randomUUID } from 'node:crypto'
import {
    createSession,
    deleteSession,
    extendSession,
    findOrCreateUser,
    findSessionByToken,
    findUserByEmail,
    updateUserEmail,
    rotateSession,
    updateUserName,
} from '../db.js'
import { clearCode, clearOtp, emailChangeKey, getCode, getOtp, storeCode, storeOtp } from '../redis.js'
import { sendOtpEmail } from '../mailer.js'
import { requireAuth, type AuthedVariables } from '../middleware.js'

export const authRoutes = new Hono<{ Variables: AuthedVariables }>()

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Sliding: every successful /session/refresh pushes expiry out again, so a
// user who comes online at least once every 15 days never has to log in again.
const SESSION_TTL_MS = 15 * 24 * 60 * 60 * 1000 // 15 days

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

/**
 * Renames the signed-in user from the settings screen. Same effect as
 * /complete-profile, kept separate so onboarding and later edits can
 * diverge without breaking each other.
 */
authRoutes.post('/update-profile', requireAuth, async (c) => {
    const user = c.get('user')
    const body = await c.req.json<{ name?: string }>()
    const name = body.name?.trim()

    if (!name) {
        return c.json({ error: 'Name is required.' }, 400)
    }

    const updated = await updateUserName(user.id, name)
    return c.json({ user: updated })
})

/**
 * Step 1 of an email change: sends a code to the NEW address, proving the
 * user controls it before login (which is OTP-by-email) moves over to it.
 */
authRoutes.post('/request-email-change', requireAuth, async (c) => {
    const user = c.get('user')
    const body = await c.req.json<{ newEmail?: string; lang?: 'pt' | 'en' }>()
    const newEmail = body.newEmail?.trim().toLowerCase()

    if (!newEmail || !EMAIL_RE.test(newEmail)) {
        return c.json({ error: 'Enter a valid email address.' }, 400)
    }
    if (newEmail === user.email) {
        return c.json({ error: 'This is already your email address.' }, 400)
    }
    if (await findUserByEmail(newEmail)) {
        return c.json({ error: 'This email is already in use by another account.' }, 409)
    }

    const code = randomCode()
    await storeCode(emailChangeKey(user.id, newEmail), code)
    await sendOtpEmail(newEmail, code, body.lang ?? 'pt')

    return c.json({ ok: true })
})

/** Step 2 of an email change: redeems the code and swaps the address. */
authRoutes.post('/confirm-email-change', requireAuth, async (c) => {
    const user = c.get('user')
    const body = await c.req.json<{ newEmail?: string; code?: string }>()
    const newEmail = body.newEmail?.trim().toLowerCase()
    const code = body.code?.trim()

    if (!newEmail || !code) {
        return c.json({ error: 'Email and code are required.' }, 400)
    }

    const key = emailChangeKey(user.id, newEmail)
    const stored = await getCode(key)
    if (!stored) {
        return c.json({ error: 'Request a new code first.' }, 400)
    }
    if (stored !== code) {
        return c.json({ error: 'Incorrect code.' }, 400)
    }

    try {
        const updated = await updateUserEmail(user.id, newEmail)
        await clearCode(key)
        return c.json({ user: updated })
    } catch (err) {
        // Someone claimed the address between request and confirm.
        if ((err as { code?: string }).code === '23505') {
            return c.json({ error: 'This email is already in use by another account.' }, 409)
        }
        throw err
    }
})

function bearerToken(header: string | undefined): string | null {
    return header?.replace(/^Bearer\s+/i, '') || null
}

/**
 * Called by the app whenever it (re)connects. The app is local-first and
 * keeps working with an expired token while offline, so this accepts
 * expired sessions too:
 *   - still valid → expiry slides forward, same token;
 *   - expired     → rotated: new token issued, old one deleted;
 *   - unknown     → 401 (revoked by /logout, or never existed): the user
 *                   has to confirm their email with a new OTP.
 */
authRoutes.post('/session/refresh', async (c) => {
    const token = bearerToken(c.req.header('Authorization'))
    if (!token) {
        return c.json({ error: 'Missing authorization token.' }, 401)
    }

    const found = await findSessionByToken(token)
    if (!found) {
        return c.json({ error: 'Session not found. Please sign in again.' }, 401)
    }

    const issuedAt = new Date()
    const expiresAt = new Date(issuedAt.getTime() + SESSION_TTL_MS)
    let activeToken = token

    if (found.expiresAt.getTime() > issuedAt.getTime()) {
        await extendSession(token, expiresAt)
    } else {
        activeToken = randomUUID()
        const rotated = await rotateSession(token, found.user.id, activeToken, expiresAt)
        if (!rotated) {
            return c.json({ error: 'Session not found. Please sign in again.' }, 401)
        }
    }

    return c.json({
        user: found.user,
        token: activeToken,
        issuedAt: issuedAt.getTime(),
        expiresAt: expiresAt.getTime(),
    })
})

/** Revokes the session server-side; the app also clears it locally. */
authRoutes.post('/logout', async (c) => {
    const token = bearerToken(c.req.header('Authorization'))
    if (token) await deleteSession(token)
    return c.json({ ok: true })
})
