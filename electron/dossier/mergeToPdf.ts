import { PDFDocument } from 'pdf-lib'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { DossierSourceFile } from '../../src/services/dossierExport/types'

export interface MergeFailure {
    absolutePath: string
    reason: string
}

export interface MergeResult {
    bytes: Uint8Array
    /** Sources that failed once actually opened — missing file, corrupt PDF, unreadable image. */
    failures: MergeFailure[]
}

// A4 in PDF points. Images are placed on whichever orientation (portrait/
// landscape) fits their aspect ratio best, scaled down to fit with a margin,
// never upscaled past their native size.
const A4_PORTRAIT = { width: 595.28, height: 841.89 }
const MARGIN = 24

/**
 * Merges an ordered list of local files (PDFs and/or images) into one PDF.
 * Best-effort: a source that can't be read or parsed is skipped and reported
 * in `failures` rather than aborting the whole category — one bad file in a
 * 300-document export shouldn't sink the rest of it.
 */
export async function mergeToPdf(sources: DossierSourceFile[]): Promise<MergeResult> {
    const out = await PDFDocument.create()
    const failures: MergeFailure[] = []

    for (const src of sources) {
        let bytes: Buffer
        try {
            bytes = await fs.readFile(src.absolutePath)
        } catch {
            failures.push({ absolutePath: src.absolutePath, reason: 'arquivo não encontrado no disco' })
            continue
        }

        try {
            if (src.kind === 'pdf') {
                const inner = await PDFDocument.load(bytes, { ignoreEncryption: true })
                const pages = await out.copyPages(inner, inner.getPageIndices())
                pages.forEach((p) => out.addPage(p))
            } else {
                const ext = path.extname(src.absolutePath).toLowerCase()
                const image = ext === '.png' ? await out.embedPng(bytes) : await out.embedJpg(bytes)
                const landscape = image.width > image.height
                const page = out.addPage(
                    landscape
                        ? [A4_PORTRAIT.height, A4_PORTRAIT.width]
                        : [A4_PORTRAIT.width, A4_PORTRAIT.height]
                )
                const { width: pageW, height: pageH } = page.getSize()
                const maxW = pageW - MARGIN * 2
                const maxH = pageH - MARGIN * 2
                const scale = Math.min(maxW / image.width, maxH / image.height, 1)
                const w = image.width * scale
                const h = image.height * scale
                page.drawImage(image, { x: (pageW - w) / 2, y: (pageH - h) / 2, width: w, height: h })
            }
        } catch (err) {
            failures.push({
                absolutePath: src.absolutePath,
                reason: err instanceof Error ? err.message : 'falha ao processar o arquivo',
            })
        }
    }

    return { bytes: await out.save(), failures }
}