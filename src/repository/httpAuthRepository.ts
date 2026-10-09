import { usePreferencesStore } from '@/store/preferenceStore'
import type { AuthRepository, Session, User, VerifyResult } from '@/types/auth'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

function currentLang(): 'pt' | 'en' {
    return usePreferencesStore.getState().language.startsWith('en') ? 'en' : 'pt'
}

async function postAuthed<T>(path: string, token: string, body: unknown, fallbackError: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
    })
    if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: null }))
        throw new Error(error ?? fallbackError)
    }
    return res.json()
}

export const httpAuthRepository: AuthRepository = {
    async requestCode(email: string) {
        const lang = currentLang()

        const res = await fetch(`${API_BASE}/auth/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, lang }),
        })

        if (!res.ok) {
            const { error } = await res.json()
            throw new Error(error ?? 'Failed to request code.')
        }
    },

    async verifyCode(email: string, code: string): Promise<VerifyResult> {
        const res = await fetch(`${API_BASE}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code }),
        })
        if (!res.ok) {
            const { error } = await res.json()
            throw new Error(error ?? 'Failed to verify code.')
        }
        const data = await res.json()
        const session: Session = {
            user: data.user,
            token: data.token,
            issuedAt: data.issuedAt,
            expiresAt: data.expiresAt,
        }
        return { session, isNewUser: data.isNewUser }
    },

    async completeProfile(token: string, name: string): Promise<User> {
        const res = await fetch(`${API_BASE}/auth/complete-profile`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ name }),
        })
        if (!res.ok) {
            const { error } = await res.json()
            throw new Error(error ?? 'Failed to update profile.')
        }
        const data = await res.json()
        return data.user
    },

    async updateProfile(token: string, name: string): Promise<User> {
        const data = await postAuthed<{ user: User }>('/auth/update-profile', token, { name }, 'Failed to update profile.')
        return data.user
    },

    async requestEmailChange(token: string, newEmail: string): Promise<void> {
        await postAuthed('/auth/request-email-change', token, { newEmail, lang: currentLang() }, 'Failed to request code.')
    },

    async confirmEmailChange(token: string, newEmail: string, code: string): Promise<User> {
        const data = await postAuthed<{ user: User }>('/auth/confirm-email-change', token, { newEmail, code }, 'Failed to verify code.')
        return data.user
    },
}
