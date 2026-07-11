export { }

declare global {
    interface Window {
        api: {
            collections: {
                list: () => Promise<any[]>
                create: (name: string) => Promise<string>
            }
        }
    }
}