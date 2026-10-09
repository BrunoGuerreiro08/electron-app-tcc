import Redis from 'ioredis'

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')

const OTP_TTL_SECONDS = 5 * 60 // 5 minutes

// Login codes are keyed by email; email-change codes are scoped to the user
// asking for the change, so a code sent to an address can't be redeemed by
// a different account.
function loginKey(email: string) {
    return `otp:${email}`
}

export function emailChangeKey(userId: string, newEmail: string) {
    return `email-change:${userId}:${newEmail}`
}

export async function storeCode(key: string, code: string) {
    await redis.set(key, code, 'EX', OTP_TTL_SECONDS)
}

export async function getCode(key: string): Promise<string | null> {
    return redis.get(key)
}

export async function clearCode(key: string) {
    await redis.del(key)
}

export async function storeOtp(email: string, code: string) {
    await storeCode(loginKey(email), code)
}

export async function getOtp(email: string): Promise<string | null> {
    return getCode(loginKey(email))
}

export async function clearOtp(email: string) {
    await clearCode(loginKey(email))
}
