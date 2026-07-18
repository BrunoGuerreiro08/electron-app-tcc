export interface Session {
    email: string
    token: string
    issuedAt: number
    expiresAt: number
}

export type AuthStep = 'email' | 'code'

export interface AuthRepository {
    requestCode(email: string): Promise<void>
    verifyCode(email: string, code: string): Promise<Session>
}