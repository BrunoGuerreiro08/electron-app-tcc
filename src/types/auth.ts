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
    /** Set by the main process: the server that issued this token. */
    serverId?: string
}

export type AuthStep = 'email' | 'code' | 'onboarding'

/**
 * Which authentication context the app is running under (NFR-14-07).
 * - checking:      validating the local token with the server
 * - authenticated: server confirmed (and renewed) the session
 * - offline:       server unreachable — the local token is trusted as-is
 * - expired:       server rejected the token (revoked); local use continues
 * - guest:         local-only guest mode, no server account
 * - server-mismatch: the configured server isn't the one that issued the token
 * - no-server:     no server URL configured on this device
 */
export type AuthStatus =
    | 'checking'
    | 'authenticated'
    | 'offline'
    | 'expired'
    | 'guest'
    | 'server-mismatch'
    | 'no-server'

/** The server rejected the session token (401). */
export class AuthExpiredError extends Error {
    constructor(message = 'Session expired.') {
        super(message)
        this.name = 'AuthExpiredError'
    }
}

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
    refreshSession(token: string): Promise<Session>
    logout(token: string): Promise<void>
}