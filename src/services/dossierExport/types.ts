export type DossierMode = 'stitched' | 'individual'
export type DossierOutputKind = 'zip' | 'folder'

export interface DossierSourceFile {
    /** Absolute path on THIS machine — only ever sent to the local main process, never serialized outward. */
    absolutePath: string
    kind: 'pdf' | 'image'
}

/** One merged PDF per category. */
export interface DossierStitchedEntry {
    kind: 'stitched'
    /** Path inside the dossier, forward-slash separated, e.g. "01 - Grupo I/02 - I.2/03 - I.2.3 - Categoria.pdf" */
    destPath: string
    categoryLabel: string
    sources: DossierSourceFile[]
}

/** One file per document, original format kept as-is. */
export interface DossierIndividualEntry {
    kind: 'individual'
    destPath: string
    documentTitle: string
    source: DossierSourceFile
}

export type DossierEntry = DossierStitchedEntry | DossierIndividualEntry

export interface DossierSkippedDocument {
    documentTitle: string
    /** "Grupo › Subgrupo › Categoria" — for display only. */
    categoryLabel: string
    reason: 'no_file' | 'unsupported_type'
}

export interface DossierPlan {
    mode: DossierMode
    collectionName: string
    entries: DossierEntry[]
    skipped: DossierSkippedDocument[]
    /** Categories that ended up with zero usable files (never had one, or every one was skipped). */
    emptyCategoryCount: number
}

/** What the main process reports back after actually writing/zipping the plan. */
export interface DossierRunResult {
    outputPath: string
    entriesWritten: number
    /** Failures discovered only once files were actually opened (missing on disk, corrupt PDF, etc). */
    failures: Array<{ destPath: string; reason: string }>
    readOnly: boolean
}
