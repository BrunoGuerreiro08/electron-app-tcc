import type { AuthRepository, Session } from '@/types/sessions'

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

    async verifyCode(email: string, code: string): Promise<Session> {
        const res = await fetch(`${API_BASE}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code }),
        })
        if (!res.ok) {
            const { error } = await res.json()
            throw new Error(error ?? 'Failed to verify code.')
        }
        return res.json()
    },
}