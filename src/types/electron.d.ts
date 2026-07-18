export { }

declare global {
    interface Window {
        api: {
            collections: {
                list: () => Promise<any[]>
                create: (name: string) => Promise<string>
            }
            session: {
                get: () => Promise<import('./auth').Session | null>
                set: (session: import('./auth').Session) => Promise<void>
                clear: () => Promise<void>
            }
        }
    }
}