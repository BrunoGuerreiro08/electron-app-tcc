import type { ScannedFile } from '@/types/entities'

export const fileRepository = {
    pick: () => window.api.files.pick(),
    attach: (documentId: string, sourcePath: string) => window.api.files.attach(documentId, sourcePath),
    remove: (documentId: string) => window.api.files.remove(documentId),
    open: (documentId: string) => window.api.files.open(documentId),
    detectOrphans: () => window.api.files.detectOrphans(),
    detectDroppedFiles: (): Promise<ScannedFile[]> => window.api.files.detectDroppedFiles(),
}