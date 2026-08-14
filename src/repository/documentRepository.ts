import type { Document } from '@/types/entities'

interface DocumentInput {
    title: string
    issuer?: string
    issuedAt?: string
    quantity?: number
    hours?: number
    notes?: string
    filePath?: string
}

export interface BulkImportItem {
    fileName: string
    title: string
}

export interface BulkImportResult {
    fileName: string
    ok: boolean
    documentId?: string
    error?: string
}

export const documentRepository = {
    list: (): Promise<Document[]> => window.api.documents.list(),
    listUnlinked: (): Promise<Document[]> => window.api.documents.listUnlinked(),
    create: (input: DocumentInput): Promise<string> => window.api.documents.create(input),
    bulkImport: (items: BulkImportItem[]): Promise<BulkImportResult[]> =>
        window.api.documents.bulkImport(items),
    update: (id: string, updates: Partial<DocumentInput>): Promise<void> =>
        window.api.documents.update(id, updates),
    delete: (id: string): Promise<void> => window.api.documents.delete(id),
}