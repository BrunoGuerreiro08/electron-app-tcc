import Store from 'electron-store'

export interface SessionRecord {
    email: string
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