import { useTranslation } from 'react-i18next'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { formatValue, type ScoreDiscrepancy, type VerificationResult } from '@/services/collectionImport/verifyScores'

const COMPLETION_STATES = ['incomplete', 'complete', 'exceeded']

/** Field names and yes/no/completion values in the UI language; numbers keep formatValue. */
function useDiscrepancyText() {
    const { t } = useTranslation('reviews')
    return {
        field: (field: ScoreDiscrepancy['field']) => t(`verify.fields.${field}`),
        value: (v: ScoreDiscrepancy['sent']) => {
            if (typeof v === 'boolean') return t(v ? 'verify.yes' : 'verify.no')
            if (typeof v === 'string' && COMPLETION_STATES.includes(v)) return t(`collections:completion.${v}`)
            return formatValue(v)
        },
    }
}

/**
 * Outcome of re-running this app's scoring engine over a received snapshot.
 * The wording is deliberately precise about what "verified" means: the numbers
 * are consistent with the data in the file — not that the data itself is genuine.
 */
export function VerificationNotice({
    verification,
    limit = 5,
}: {
    verification: VerificationResult
    /** How many differences to list before "and N more" */
    limit?: number
}) {
    const { t } = useTranslation('reviews')
    const text = useDiscrepancyText()

    if (verification.status === 'verified') {
        return (
            <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm">
                <CheckCircle className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                <div>
                    <p className="font-medium">{t('verify.ok.title')}</p>
                    <p className="text-muted-foreground">
                        {t('verify.ok.body', { n: verification.checked })}
                    </p>
                </div>
            </div>
        )
    }

    if (verification.status === 'error') {
        return (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                <div>
                    <p className="font-medium">{t('verify.error.title')}</p>
                    <p className="text-muted-foreground">{verification.message}</p>
                </div>
            </div>
        )
    }

    const { discrepancies } = verification
    const shown = discrepancies.slice(0, limit)
    return (
        <div role="alert" className="rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm space-y-2">
            <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
                <div>
                    <p className="font-medium">
                        {t('verify.mismatch.title', { n: discrepancies.length })}
                    </p>
                    <p className="text-muted-foreground">
                        {t('verify.mismatch.body')}
                    </p>
                </div>
            </div>
            <ul className="list-disc pl-9 space-y-0.5 text-xs">
                {shown.map((d, i) => (
                    <li key={i}>
                        <span className="text-foreground">{d.label}</span> — {text.field(d.field)}:{' '}
                        {t('verify.sent')} {text.value(d.sent)}, {t('verify.recomputed')}{' '}
                        {text.value(d.recomputed)}
                    </li>
                ))}
            </ul>
            {discrepancies.length > shown.length && (
                <p className="pl-9 text-xs text-muted-foreground">
                    {t('verify.more', { n: discrepancies.length - shown.length })}
                </p>
            )}
        </div>
    )
}

/** Small inline marker placed next to a number that the recalculation disagrees with. */
export function MismatchTag({ items }: { items?: ScoreDiscrepancy[] }) {
    const { t } = useTranslation('reviews')
    const text = useDiscrepancyText()
    if (!items || items.length === 0) return null
    return (
        <span
            className="text-xs font-medium text-amber-600"
            title={items
                .map(
                    (d) =>
                        `${text.field(d.field)}: ${t('verify.sent')} ${text.value(d.sent)}, ${t('verify.recomputed')} ${text.value(d.recomputed)}`
                )
                .join('\n')}
        >
            {items.map((d, i) => (
                <span key={i} className="mr-1">
                    ≠ {text.field(d.field)} {text.value(d.recomputed)}
                </span>
            ))}
        </span>
    )
}

/**
 * Whether the received collection still exactly matches the structure of the
 * template it was created from — recomputed here, not read off a label the
 * sender's file claims (see verifyTemplateOrigin: a hand-edited file that
 * flips the claim without touching the structure is still caught).
 */
export function TemplateOriginNotice({ origin }: { origin: import('@/services/collectionImport/verifyTemplateOrigin').TemplateOriginResult }) {
    const { t } = useTranslation('reviews')
    if (origin.status === 'none') return null

    if (origin.status === 'unmodified') {
        return (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                {t('template.unmodified', {
                    name: origin.templateName,
                })}
            </p>
        )
    }
    if (origin.status === 'modified') {
        return (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                {t('template.modified', {
                    name: origin.templateName,
                })}
            </p>
        )
    }
    // claim_disputed: the label and the recomputation disagree — worth a slightly louder flag
    return (
        <p className="text-xs text-amber-600 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            {t('template.disputed',
                { name: origin.templateName }
            )}
        </p>
    )
}