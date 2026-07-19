import type { AuthRepository, Session, User, VerifyResult } from '@/types/auth'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

export const httpAuthRepository: AuthRepository = {
    async requestCode(email: string) {
        const res = await fetch(`${API_BASE}/auth/request-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
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
}