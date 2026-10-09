export interface User {
    id: string
    email: string
    name: string | null
}

export interface Session {
    user: User
    token: string
    issuedAt: number
    expiresAt: number
    isGuest?: boolean
}

export type AuthStep = 'email' | 'code' | 'onboarding'

export interface VerifyResult {
    session: Session
    isNewUser: boolean
}

export interface AuthRepository {
    requestCode(email: string): Promise<void>
    verifyCode(email: string, code: string): Promise<VerifyResult>
    completeProfile(token: string, name: string): Promise<User>
    updateProfile(token: string, name: string): Promise<User>
    requestEmailChange(token: string, newEmail: string): Promise<void>
    confirmEmailChange(token: string, newEmail: string, code: string): Promise<User>
}