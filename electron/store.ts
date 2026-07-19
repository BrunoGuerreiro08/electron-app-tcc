import Store from 'electron-store'

export interface SessionRecord {
    user: { id: string; email: string; name: string | null }
    token: string
    issuedAt: number
    expiresAt: number
}

interface StoreSchema {
    session: SessionRecord | null
}

export const store = new Store<StoreSchema>({
    defaults: {
        session: null,
    },
})