import type { Context, Next } from 'hono'
import { getSessionUser, type UserRecord } from './db.js'

export type AuthedVariables = { user: UserRecord }

export async function requireAuth(c: Context<{ Variables: AuthedVariables }>, next: Next) {
    const authHeader = c.req.header('Authorization')
    const token = authHeader?.replace(/^Bearer\s+/i, '')

    if (!token) {
        return c.json({ error: 'Missing authorization token.' }, 401)
    }

    const user = await getSessionUser(token)
    if (!user) {
        return c.json({ error: 'Invalid or expired session.' }, 401)
    }

    c.set('user', user)
    await next()
}