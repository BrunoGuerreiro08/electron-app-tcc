import Redis from 'ioredis'

export const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')

const OTP_TTL_SECONDS = 5 * 60 // 5 minutes

export async function storeOtp(email: string, code: string) {
    await redis.set(`otp:${email}`, code, 'EX', OTP_TTL_SECONDS)
}

export async function getOtp(email: string): Promise<string | null> {
    return redis.get(`otp:${email}`)
}

export async function clearOtp(email: string) {
    await redis.del(`otp:${email}`)
}