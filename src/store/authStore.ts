import { create } from 'zustand'
import type { AuthStep, Session } from '@/types/auth'
import { httpAuthRepository } from '@/repository/httpAuthRepository'

interface AuthState {
    step: AuthStep
    email: string
    session: Session | null
    /** Set only while onboarding is in progress — not yet persisted */
    pendingSession: Session | null
    loading: boolean
    initializing: boolean
    error: string | null
    init: () => Promise<void>
    requestCode: (email: string) => Promise<void>
    verifyCode: (code: string) => Promise<void>
    completeProfile: (name: string) => Promise<void>
    reset: () => void
    logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
    step: 'email',
    email: '',
    session: null,
    pendingSession: null,
    loading: false,
    initializing: true,
    error: null,

    init: async () => {
        const session = await window.api.session.get()
        if (session && session.expiresAt > Date.now()) {
            set({ session, initializing: false })
        } else {
            if (session) await window.api.session.clear()
            set({ initializing: false })
        }
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
                set({ session, loading: false })
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
            set({ session: updatedSession, pendingSession: null, loading: false })
        } catch (err) {
            set({ error: (err as Error).message, loading: false })
        }
    },

    reset: () => set({ step: 'email', error: null }),

    logout: async () => {
        await window.api.session.clear()
        set({ step: 'email', email: '', session: null, pendingSession: null, error: null })
    },
}))