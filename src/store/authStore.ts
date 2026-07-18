import { create } from 'zustand'
import type { AuthStep, Session } from '@/types/sessions'
import { mockAuthRepository } from '@/repository/mockAuthRepository'

interface AuthState {
    step: AuthStep
    email: string
    session: Session | null
    loading: boolean
    initializing: boolean
    error: string | null
    init: () => Promise<void>
    requestCode: (email: string) => Promise<void>
    verifyCode: (code: string) => Promise<void>
    reset: () => void
    logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
    step: 'email',
    email: '',
    session: null,
    loading: false,
    initializing: true,
    error: null,

    init: async () => {
        const session = await window.api.session.get()
        if (session && session.expiresAt > Date.now()) {
            set({ session, initializing: false })
        } else {
            if (session) await window.api.session.clear() // expired — clean up
            set({ initializing: false })
        }
    },

    requestCode: async (email: string) => {
        set({ loading: true, error: null })
        try {
            await mockAuthRepository.requestCode(email)
            set({ email, step: 'code', loading: false })
        } catch (err) {
            set({ error: (err as Error).message, loading: false })
        }
    },

    verifyCode: async (code: string) => {
        const { email } = get()
        set({ loading: true, error: null })
        try {
            const session = await mockAuthRepository.verifyCode(email, code)
            await window.api.session.set(session)
            set({ session, loading: false })
        } catch (err) {
            set({ error: (err as Error).message, loading: false })
        }
    },

    reset: () => set({ step: 'email', error: null }),

    logout: async () => {
        await window.api.session.clear()
        set({ step: 'email', email: '', session: null, error: null })
    },
}))