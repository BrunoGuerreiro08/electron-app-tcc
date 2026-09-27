import type { ReportData } from '../reportEngine/types'
import { dedupeInFolder, sanitizeSegment, withOrderPrefix } from './sanitizeName'
import type {
    DossierEntry,
    DossierMode,
    DossierPlan,
    DossierSkippedDocument,
    DossierSourceFile,
} from './types'

const PDF_EXT = new Set(['.pdf'])
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png'])

function extensionOf(path: string): string {
    const m = /\.[^./\\]+$/.exec(path)
    return m ? m[0].toLowerCase() : ''
}

function classify(filePath: string): DossierSourceFile['kind'] | null {
    const ext = extensionOf(filePath)
    if (PDF_EXT.has(ext)) return 'pdf'
    if (IMAGE_EXT.has(ext)) return 'image'
    return null
}

/** Chronological within a category — a portfolio reads better in date order than DB insertion order. Undated documents sort last, stable otherwise. */
function byIssuedAt<T extends { issuedAt: string | null }>(items: T[]): T[] {
    return items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
            const da = a.item.issuedAt ?? '\uffff'
            const db = b.item.issuedAt ?? '\uffff'
            return da === db ? a.index - b.index : da < db ? -1 : 1
        })
        .map((x) => x.item)
}

/**
 * Turns a ReportData snapshot (the same one the PDF/JSON/XLSX exports already
 * use, still carrying real local file paths) into a concrete plan of what
 * file goes where. Pure and synchronous — no disk access, so every path
 * decision here is unit-testable without touching Electron.
 *
 * A category becomes:
 *   - stitched mode:   one entry, one merged PDF named after the category
 *   - individual mode: one entry per document, named after the document,
 *                       inside a folder named after the category
 *
 * Group/subgroup/category folder names carry a numeric prefix (their display
 * order) so a file browser's default alphabetical sort still matches the
 * app's order. Document file names don't — a reviewer scanning for one
 * document benefits more from alphabetical-by-title than from insertion order.
 */
export function buildDossierPlan(report: ReportData, mode: DossierMode): DossierPlan {
    const entries: DossierEntry[] = []
    const skipped: DossierSkippedDocument[] = []
    let emptyCategoryCount = 0

    report.groups.forEach((group, gi) => {
        const groupSeg = withOrderPrefix(gi, sanitizeSegment(group.name, `Grupo ${gi + 1}`))

        group.subgroups.forEach((subgroup, si) => {
            const subSeg = withOrderPrefix(si, sanitizeSegment(subgroup.name, `Subgrupo ${si + 1}`))
            const folderPrefix = `${groupSeg}/${subSeg}`
            const usedInSubgroup = new Set<string>() // stitched-mode category filenames share this folder

            subgroup.categories.forEach((category, ci) => {
                const categoryLabel = `${group.name} › ${subgroup.name} › ${category.name}`
                const catSeg = sanitizeSegment(category.name, `Categoria ${ci + 1}`)
                const catSegOrdered = withOrderPrefix(ci, catSeg)

                const usable: Array<{ doc: (typeof category.documents)[number]; kind: 'pdf' | 'image' }> = []
                for (const doc of category.documents) {
                    if (!doc.hasFile || !doc.filePath) {
                        skipped.push({ documentTitle: doc.title, categoryLabel, reason: 'no_file' })
                        continue
                    }
                    const kind = classify(doc.filePath)
                    if (!kind) {
                        skipped.push({ documentTitle: doc.title, categoryLabel, reason: 'unsupported_type' })
                        continue
                    }
                    usable.push({ doc, kind })
                }

                if (usable.length === 0) {
                    emptyCategoryCount++
                    return
                }

                if (mode === 'stitched') {
                    const fileName = dedupeInFolder(usedInSubgroup, catSegOrdered, '.pdf')
                    entries.push({
                        kind: 'stitched',
                        destPath: `${folderPrefix}/${fileName}`,
                        categoryLabel,
                        sources: byIssuedAt(usable.map((u) => u.doc)).map((doc) => ({
                            absolutePath: doc.filePath as string,
                            kind: classify(doc.filePath as string) as 'pdf' | 'image',
                        })),
                    })
                } else {
                    const catFolder = `${folderPrefix}/${catSegOrdered}`
                    const usedInCategory = new Set<string>()
                    for (const { doc, kind } of byIssuedAt(usable.map((u) => u.doc)).map((doc) => ({
                        doc,
                        kind: classify(doc.filePath as string) as 'pdf' | 'image',
                    }))) {
                        const ext = extensionOf(doc.filePath as string)
                        const base = sanitizeSegment(doc.title, 'documento')
                        const fileName = dedupeInFolder(usedInCategory, base, ext)
                        entries.push({
                            kind: 'individual',
                            destPath: `${catFolder}/${fileName}`,
                            documentTitle: doc.title,
                            source: { absolutePath: doc.filePath as string, kind },
                        })
                    }
                }
            })
        })
    })

    return { mode, collectionName: report.collectionName, entries, skipped, emptyCategoryCount }
}
