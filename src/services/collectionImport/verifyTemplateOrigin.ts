import { computeStructureFingerprint } from '@/services/templateMatch/structureFingerprint'
import { structureFromCollectionExport } from '@/services/templateMatch/adapters'
import type { ReviewSnapshot } from '@/types/review'

export type TemplateOriginResult =
    | { status: 'none' } // collection wasn't made from a template (or the sender didn't say so)
    | { status: 'unmodified'; templateName: string } // recomputation agrees: still matches the template
    | { status: 'modified'; templateName: string } // sender's own app already knew this — label is honest
    | { status: 'claim_disputed'; templateName: string } // sender claims "unmodified" but recomputing says otherwise

/**
 * Recomputes the received collection's structure fingerprint and compares it
 * with `template_origin`, the same "don't just trust the label" pattern as
 * verifyScores.ts. `claim_disputed` is the interesting case: it means either
 * the file was hand-edited after export, or the two apps compute the
 * fingerprint differently (a version mismatch) — not necessarily bad faith.
 */
export function verifyTemplateOrigin(data: ReviewSnapshot): TemplateOriginResult {
    const origin = data.template_origin
    if (!origin) return { status: 'none' }

    const recomputed = computeStructureFingerprint(structureFromCollectionExport(data))
    const matchesTemplate = recomputed === origin.template_fingerprint

    if (!matchesTemplate) return { status: 'modified', templateName: origin.template_name }
    return origin.unmodified
        ? { status: 'unmodified', templateName: origin.template_name }
        : { status: 'claim_disputed', templateName: origin.template_name }
}