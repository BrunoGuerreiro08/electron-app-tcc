import { create } from 'zustand'
import { AuthExpiredError, type AuthStatus, type AuthStep, type Session, type User } from '@/types/auth'
import { httpAuthRepository } from '@/repository/httpAuthRepository'
import { useServerStatusStore, type ServerStatus } from '@/store/serverStatusStore'

// Renew ahead of time when the app stays open for days.
const RENEW_BEFORE_MS = 24 * 60 * 60 * 1000

interface AuthState {
    step: AuthStep
    email: string
    session: Session | null
    authStatus: AuthStatus
    /** Set only while onboarding is in progress — not yet persisted */
    pendingSession: Session | null
    loading: boolean
    initializing: boolean
    error: string | null
    init: () => Promise<void>
    requestCode: (email: string) => Promise<void>
    verifyCode: (code: string) => Promise<void>
    completeProfile: (name: string) => Promise<void>
    loginAsGuest: () => Promise<void>
    // Settings-screen actions: throw on failure so the screen can show the
    // error inline, instead of reusing the login flow's `error`/`loading`.
    updateName: (name: string) => Promise<void>
    requestEmailChange: (newEmail: string) => Promise<void>
    confirmEmailChange: (newEmail: string, code: string) => Promise<void>
    /** Reacts to server reachability: trusts the local token offline, renews it online. */
    handleServerStatus: (status: ServerStatus) => void
    /** Never throws — offline or rejected tokens only change `authStatus`. */
    validateSession: () => Promise<void>
    // Recovery for `expired`: OTP to the session's own email, no logout.
    requestReauthCode: () => Promise<void>
    confirmReauthCode: (code: string) => Promise<void>
    reset: () => void
    logout: () => Promise<void>
}

let validationInFlight: Promise<void> | null = null

export const useAuthStore = create<AuthState>((set, get) => ({
    step: 'email',
    email: '',
    session: null,
    authStatus: 'checking',
    pendingSession: null,
    loading: false,
    initializing: true,
    error: null,

    // Local-first (NFR-14-06): a stored session is always restored, even past
    // its expiresAt — the server decides validity once it's reachable.
    init: async () => {
        const session = await window.api.session.get()
        set({
            session,
            authStatus: session?.isGuest ? 'guest' : 'checking',
            initializing: false,
        })
    },

    requestCode: async (email: string) => {
        set({ loading: true, error: null })
        try {
            await httpAuthRepository.requestCode(email)
            set({ email, step: 'code', loading: false })
        } catch (err) {
            set({ error: (err as Error).message, loading: false })
        }
    },

    verifyCode: async (code: string) => {
        const { email } = get()
        set({ loading: true, error: null })
        try {
            const { session, isNewUser } = await httpAuthRepository.verifyCode(email, code)
            if (isNewUser) {
                // Not persisted, and NOT written to `session` — App.tsx must keep
                // showing LoginScreen until onboarding actually completes.
                set({ pendingSession: session, step: 'onboarding', loading: false })
            } else {
                await window.api.session.set(session)
                set({ session, authStatus: 'authenticated', loading: false })
            }
        } catch (err) {
            set({ error: (err as Error).message, loading: false })
        }
    },

    completeProfile: async (name: string) => {
        const { pendingSession } = get()
        if (!pendingSession) return
        set({ loading: true, error: null })
        try {
            const user = await httpAuthRepository.completeProfile(pendingSession.token, name)
            const updatedSession: Session = { ...pendingSession, user }
            await window.api.session.set(updatedSession)
            set({ session: updatedSession, authStatus: 'authenticated', pendingSession: null, loading: false })
        } catch (err) {
            set({ error: (err as Error).message, loading: false })
        }
    },

    loginAsGuest: async () => {
        set({ loading: true, error: null })
        try {
            const now = Date.now()
            const guestSession: Session = {
                token: 'guest_local_token',
                issuedAt: now,
                expiresAt: now + 1000 * 60 * 60 * 24 * 365,
                isGuest: true,
                user: {
                    id: 'guest',
                    email: 'guest@local',
                    name: 'Guest User',
                }
            }

            await window.api.session.set(guestSession)
            set({ session: guestSession, authStatus: 'guest', step: 'email', loading: false })
        } catch (err) {
            set({ error: (err as Error).message, loading: false })
        }
    },

    updateName: async (name: string) => {
        await withAuthRetry(get, async (session) => {
            const user = await httpAuthRepository.updateProfile(session.token, name)
            await applyUser(get().session ?? session, user, set)
        })
    },

    requestEmailChange: async (newEmail: string) => {
        await withAuthRetry(get, (session) => httpAuthRepository.requestEmailChange(session.token, newEmail))
    },

    confirmEmailChange: async (newEmail: string, code: string) => {
        await withAuthRetry(get, async (session) => {
            const user = await httpAuthRepository.confirmEmailChange(session.token, newEmail, code)
            await applyUser(get().session ?? session, user, set)
        })
    },

    handleServerStatus: (status) => {
        const { session, authStatus, validateSession } = get()
        if (!session || session.isGuest) return

        if (status === 'offline') {
            if (authStatus !== 'offline') set({ authStatus: 'offline' })
            return
        }
        // Expired means the server already rejected this token; retrying on
        // every poll can't fix that — only re-authenticating can.
        if (status !== 'online' || authStatus === 'expired') return

        const nearExpiry = session.expiresAt - Date.now() < RENEW_BEFORE_MS
        if (authStatus !== 'authenticated' || nearExpiry) validateSession()
    },

    validateSession: () => {
        validationInFlight ??= (async () => {
            const session = get().session
            if (!session || session.isGuest) return

            // Only flash "checking" when there's no better-known state yet.
            if (get().authStatus !== 'authenticated') set({ authStatus: 'checking' })
            try {
                const renewed = await httpAuthRepository.refreshSession(session.token)
                // Keep anything the server doesn't send (e.g. flags) from the local record.
                const updated: Session = { ...session, ...renewed }
                await window.api.session.update(updated)
                set({ session: updated, authStatus: 'authenticated' })
            } catch (err) {
                set({ authStatus: err instanceof AuthExpiredError ? 'expired' : 'offline' })
            }
        })().finally(() => {
            validationInFlight = null
        })
        return validationInFlight
    },

    requestReauthCode: async () => {
        const session = requireAccountSession(get().session)
        await httpAuthRepository.requestCode(session.user.email)
    },

    confirmReauthCode: async (code: string) => {
        const session = requireAccountSession(get().session)
        const { session: fresh } = await httpAuthRepository.verifyCode(session.user.email, code)
        // Same email → same account; guard anyway so a token for another
        // user can never be written into this user's local session.
        if (fresh.user.id !== session.user.id) {
            throw new Error('This code belongs to a different account.')
        }
        await window.api.session.update(fresh)
        set({ session: fresh, authStatus: 'authenticated' })
    },

    reset: () => set({ step: 'email', error: null }),

    logout: async () => {
        const session = get().session
        // Revoke server-side when reachable; offline there's nothing to wait for.
        if (session && !session.isGuest && useServerStatusStore.getState().status === 'online') {
            await httpAuthRepository.logout(session.token)
        }
        await window.api.session.clear()
        set({ step: 'email', email: '', session: null, authStatus: 'checking', pendingSession: null, error: null })
    },
}))

/**
 * Runs a server action with the current token. On a 401, tries to renew
 * the session once and repeats the action with the new token; if renewal
 * isn't possible, `authStatus` already says why and the error propagates.
 */
async function withAuthRetry(get: () => AuthState, action: (session: Session) => Promise<void>): Promise<void> {
    try {
        await action(requireAccountSession(get().session))
    } catch (err) {
        if (!(err instanceof AuthExpiredError)) throw err
        await get().validateSession()
        if (get().authStatus !== 'authenticated') throw err
        await action(requireAccountSession(get().session))
    }
}

function requireAccountSession(session: Session | null): Session {
    if (!session || session.isGuest) {
        throw new Error('Profile changes require a signed-in account.')
    }
    return session
}

// Persists the updated user so the next app start restores it too.
async function applyUser(session: Session, user: User, set: (partial: Partial<AuthState>) => void) {
    const updated: Session = { ...session, user }
    await window.api.session.update(updated)
    set({ session: updated })
}
