export { }

declare global {
    interface Window {
        api: {
            collections: {
                get: (id: string) => Promise<any | null>
                list: () => Promise<any[]>
                create: (name: string, color?: string) => Promise<string>
                rename: (id: string, name: string) => Promise<void>
                delete: (id: string) => Promise<void>
            }
            groups: {
                listByCollection: (collectionId: string) => Promise<import('./entities').Group[]>
                create: (collectionId: string, name: string, displayOrder?: number) => Promise<string>
                update: (id: string, updates: unknown) => Promise<void>
                delete: (id: string) => Promise<void>
            }
            subgroups: {
                listByCollection: (collectionId: string) => Promise<import('./entities').Subgroup[]>
                create: (collectionId: string, groupId: string, name: string, displayOrder?: number) => Promise<string>
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
                bulkImport: (
                    items: { fileName: string; title: string }[]
                ) => Promise<
                    { fileName: string; ok: boolean; documentId?: string; error?: string }[]
                >
                update: (id: string, updates: unknown) => Promise<void>
                delete: (id: string) => Promise<void>
            }
            tags: {
                list: () => Promise<any[]>
                create: (name: string, color?: string) => Promise<string>
                update: (id: string, name: string, color?: string) => Promise<void>,
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
            files: {
                pick: () => Promise<{ ok: true; path: string; size: number } | { ok: false; error: string } | null>
                attach: (documentId: string, sourcePath: string) =>
                    Promise<{ ok: true; filePath: string } | { ok: false; error: string }>
                remove: (documentId: string) => Promise<void>
                open: (documentId: string) => Promise<void>
                detectOrphans: () => Promise<{ orphanedFiles: string[]; missingFiles: string[] }>
                detectDroppedFiles: () => Promise<import('./entities').ScannedFile[]>
            }
            reports: {
                printToPdf: (htmlContent: string) => Promise<Uint8Array>
                exportDossier: (params: ReportExportParams) => Promise<ReportExportResult>
            }
            preferences: {
                get: () => Promise<{ language: 'en' | 'pt-BR'; theme: 'light' | 'dark' }>
                setLanguage: (language: 'en' | 'pt-BR') => Promise<void>
                setTheme: (theme: 'light' | 'dark') => Promise<void>
            }
            templates: {
                listOfficial: () => Promise<import('./entities').TemplateSummary[]>
                listImported: () => Promise<import('./entities').TemplateSummary[]>
                pickAndImport: () => Promise<
                    | { ok: true; fileName: string; template: import('./entities').TemplateFile }
                    | { ok: false; errors: string[] }
                    | null
                >
                apply: (
                    source: { kind: 'official' | 'imported'; fileName: string },
                    collectionName: string,
                    color: string | null
                ) => Promise<string>
                exportCollection: (
                    collectionId: string
                ) => Promise<{ ok: true; filePath: string } | { ok: false; error: string } | null>
                deleteImported: (fileName: string) => Promise<void>
            }
        }
    }
}