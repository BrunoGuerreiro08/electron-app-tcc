export { }

declare global {
    interface Window {
        api: {
            collections: {
                list: () => Promise<any[]>
                create: (name: string, color?: string) => Promise<string>
                rename: (id: string, name: string) => Promise<void>
                delete: (id: string) => Promise<void>
            }
            subgroups: {
                listByCollection: (collectionId: string) => Promise<any[]>
                create: (collectionId: string, name: string, displayOrder?: number) => Promise<string>
                update: (id: string, updates: unknown) => Promise<void>
                delete: (id: string) => Promise<void>
            }
            categories: {
                listBySubgroup: (subgroupId: string) => Promise<any[]>
                create: (subgroupId: string, name: string, rule: unknown, displayOrder?: number) => Promise<string>
                update: (id: string, updates: unknown) => Promise<void>
                delete: (id: string) => Promise<void>
            }
            documents: {
                list: () => Promise<any[]>
                listUnlinked: () => Promise<any[]>
                create: (input: unknown) => Promise<string>
                update: (id: string, updates: unknown) => Promise<void>
                delete: (id: string) => Promise<void>
            }
            tags: {
                list: () => Promise<any[]>
                create: (name: string, color?: string) => Promise<string>
                delete: (id: string) => Promise<void>
                listForDocument: (documentId: string) => Promise<any[]>
                attachToDocument: (documentId: string, tagId: string) => Promise<void>
                detachFromDocument: (documentId: string, tagId: string) => Promise<void>
            }
            documentCategoryLinks: {
                listByCategory: (categoryId: string) => Promise<any[]>
                listByDocument: (documentId: string) => Promise<any[]>
                link: (documentId: string, categoryId: string) => Promise<void>
                unlink: (documentId: string, categoryId: string) => Promise<void>
            }
            session: {
                get: () => Promise<import('./auth').Session | null>
                set: (session: import('./auth').Session) => Promise<void>
                clear: () => Promise<void>
            }
            settings: {
                getStorageFolder: () => Promise<{ path: string; isCustom: boolean }>
                pickStorageFolder: () => Promise<string | null>
                changeStorageFolder: (
                    newFolder: string
                ) => Promise<{ moved: number; failed: number; errors: string[] }>
            }
        }
    }
}