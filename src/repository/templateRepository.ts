import type { TemplateSummary, TemplateFile } from '@/types/entities'

export const templateRepository = {
    listOfficial: (): Promise<TemplateSummary[]> => window.api.templates.listOfficial(),
    listImported: (): Promise<TemplateSummary[]> => window.api.templates.listImported(),
    pickAndImport: (): Promise<
        | { ok: true; fileName: string; template: TemplateFile }
        | { ok: false; errors: string[] }
        | null
    > => window.api.templates.pickAndImport(),
    apply: (
        source: { kind: 'official' | 'imported'; fileName: string },
        collectionName: string,
        color: string | null
    ): Promise<string> => window.api.templates.apply(source, collectionName, color),
    exportCollection: (
        collectionId: string
    ): Promise<{ ok: true; filePath: string } | { ok: false; error: string } | null> =>
        window.api.templates.exportCollection(collectionId),
    deleteImported: (fileName: string): Promise<void> => window.api.templates.deleteImported(fileName),
}