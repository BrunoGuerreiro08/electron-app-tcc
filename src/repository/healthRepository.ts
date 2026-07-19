const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

export async function checkServerHealth(timeoutMs = 3000): Promise<boolean> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    try {
        const res = await fetch(`${API_BASE}/health`, { signal: controller.signal })
        return res.ok
    } catch {
        return false
    } finally {
        clearTimeout(timeout)
    }
}