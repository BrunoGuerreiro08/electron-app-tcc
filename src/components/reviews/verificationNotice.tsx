import { useTranslation } from 'react-i18next'
import { AlertCircle, CheckCircle } from 'lucide-react'
import {
    FIELD_LABELS,
    formatValue,
    type ScoreDiscrepancy,
    type VerificationResult,
} from '@/services/collectionImport/verifyScores'

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

    if (verification.status === 'verified') {
        return (
            <div role="status" className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm">
                <CheckCircle className="h-4 w-4 mt-0.5 text-emerald-600 shrink-0" />
                <div>
                    <p className="font-medium">{t('verify.ok.title', 'Pontuações conferidas')}</p>
                    <p className="text-muted-foreground">
                        {t('verify.ok.body', {
                            defaultValue:
                                'O recálculo com o motor de pontuação deste aplicativo coincide com os valores enviados ({{n}} valores conferidos). Isso confirma que as contas estão consistentes com os dados do arquivo, não que os documentos sejam autênticos.',
                            n: verification.checked,
                        })}
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
                    <p className="font-medium">{t('verify.error.title', 'Não foi possível conferir as pontuações')}</p>
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
                        {t('verify.mismatch.title', {
                            defaultValue: '{{n}} diferença(s) entre os valores enviados e o recálculo',
                            n: discrepancies.length,
                        })}
                    </p>
                    <p className="text-muted-foreground">
                        {t(
                            'verify.mismatch.body',
                            'Pode indicar que o arquivo foi alterado, que ele é inconsistente, ou que quem enviou usa uma versão do aplicativo com regras de pontuação diferentes. Confirme com quem enviou antes de aprovar.'
                        )}
                    </p>
                </div>
            </div>
            <ul className="list-disc pl-9 space-y-0.5 text-xs">
                {shown.map((d, i) => (
                    <li key={i}>
                        <span className="text-foreground">{d.label}</span> — {FIELD_LABELS[d.field]}:{' '}
                        {t('verify.sent', 'enviado')} {formatValue(d.sent)}, {t('verify.recomputed', 'recalculado')}{' '}
                        {formatValue(d.recomputed)}
                    </li>
                ))}
            </ul>
            {discrepancies.length > shown.length && (
                <p className="pl-9 text-xs text-muted-foreground">
                    {t('verify.more', {
                        defaultValue: 'e mais {{n}} — todas ficam marcadas na revisão.',
                        n: discrepancies.length - shown.length,
                    })}
                </p>
            )}
        </div>
    )
}

/** Small inline marker placed next to a number that the recalculation disagrees with. */
export function MismatchTag({ items }: { items?: ScoreDiscrepancy[] }) {
    if (!items || items.length === 0) return null
    return (
        <span
            className="text-xs font-medium text-amber-600"
            title={items.map((d) => `${FIELD_LABELS[d.field]}: enviado ${formatValue(d.sent)}, recalculado ${formatValue(d.recomputed)}`).join('\n')}
        >
            {items.map((d, i) => (
                <span key={i} className="mr-1">
                    ≠ {FIELD_LABELS[d.field]} {formatValue(d.recomputed)}
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
                {t('template.unmodified', 'Estrutura idêntica ao modelo "{{name}}", sem alterações.', {
                    name: origin.templateName,
                })}
            </p>
        )
    }
    if (origin.status === 'modified') {
        return (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                {t('template.modified', 'Baseada no modelo "{{name}}", com alterações na estrutura.', {
                    name: origin.templateName,
                })}
            </p>
        )
    }
    // claim_disputed: the label and the recomputation disagree — worth a slightly louder flag
    return (
        <p className="text-xs text-amber-600 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" />
            {t(
                'template.disputed',
                'O arquivo diz uma coisa sobre o modelo "{{name}}", mas o recálculo da estrutura discorda — confira com quem enviou.',
                { name: origin.templateName }
            )}
        </p>
    )
}