import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ChevronRight, Eye, Paperclip, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { reviewRepository } from '@/repository/reviewRepository'
import { completionLabel, describeRule } from '@/services/reportEngine/exporters/shared'
import { keyOf, verifySnapshotScores, type ScoreDiscrepancy } from '@/services/collectionImport/verifyScores'
import { verifyTemplateOrigin } from '@/services/collectionImport/verifyTemplateOrigin'
import { MismatchTag, TemplateOriginNotice, VerificationNotice } from './verificationNotice'
import type { StoredReview } from '@/types/review'
import { formatPoints } from '@/lib/formatPoints'

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR')
const fmtDate = (iso: string | null) => {
    const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso ?? '')
}
const pts = formatPoints

/** Loader: fetches the stored snapshot, then hands it to the pure view. */
export function ReviewDetailScreen() {
    const { t } = useTranslation('reviews')
    const { reviewId } = useParams<{ reviewId: string }>()
    const navigate = useNavigate()
    const [review, setReview] = useState<StoredReview | null>(null)
    const [error, setError] = useState(false)

    useEffect(() => {
        if (!reviewId) return
        let cancelled = false
        reviewRepository
            .get(reviewId)
            .then((r) => !cancelled && setReview(r))
            .catch((err) => {
                console.error('Failed to load review:', err)
                if (!cancelled) setError(true)
            })
        return () => {
            cancelled = true
        }
    }, [reviewId])

    if (error) {
        return (
            <div className="p-12 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                    {t('errors.notFound')}
                </p>
                <Button variant="outline" onClick={() => navigate('/reviews')}>
                    {t('actions.backToList')}
                </Button>
            </div>
        )
    }
    if (!review) {
        return <div className="p-12 text-center text-sm text-muted-foreground">{t('loading')}</div>
    }
    return <ReviewView review={review} onBack={() => navigate('/reviews')} />
}

/**
 * Read-only rendering of a received snapshot. There is intentionally no edit
 * affordance anywhere: no forms, no mutation callbacks — only display.
 * All numbers are the sender's calculated values, shown exactly as sent.
 */
export function ReviewView({ review, onBack }: { review: StoredReview; onBack?: () => void }) {
    const { t } = useTranslation('reviews')
    const { data } = review
    const [hideEmpty, setHideEmpty] = useState(true)

    // Re-run THIS app's engine over the received data and compare with what was sent.
    // Done on view (not stored) so it always reflects the current engine.
    const verification = useMemo(() => verifySnapshotScores(data), [data])
    const templateOrigin = useMemo(() => verifyTemplateOrigin(data), [data])
    const flagged = useMemo(() => {
        const map = new Map<string, ScoreDiscrepancy[]>()
        if (verification.status === 'mismatch')
            for (const d of verification.discrepancies) map.set(d.key, [...(map.get(d.key) ?? []), d])
        return map
    }, [verification])

    const stats = useMemo(() => {
        let documents = 0
        let withoutFile = 0
        for (const g of data.groups)
            for (const s of g.subgroups)
                for (const c of s.categories)
                    for (const d of c.documents) {
                        documents++
                        if (!d.has_file) withoutFile++
                    }
        return { documents, withoutFile }
    }, [data])

    return (
        <div className="space-y-6 p-6 max-w-5xl mx-auto">
            <div className="flex items-start gap-3">
                {onBack && (
                    <Button variant="ghost" size="icon" onClick={onBack} title={t('actions.backToList')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                )}
                <div className="min-w-0 flex-1">
                    <h1 className="text-2xl font-semibold flex items-center gap-2">
                        <Eye className="h-6 w-6 text-primary shrink-0" />
                        <span className="truncate">{data.name}</span>
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {data.exported_by
                            ? `${t('fields.sender')} ${data.exported_by.name}${data.exported_by.email ? ` (${data.exported_by.email})` : ''}`
                            : t('fields.senderUnknown')}
                        {' · '}
                        {t('fields.exportedAt')} {fmtDateTime(data.exported_at)}
                    </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className="text-base font-bold text-primary px-3 py-1">
                        {pts(data.total_score)} pts
                    </Badge>
                    <MismatchTag items={flagged.get(keyOf.total)} />
                </div>
            </div>

            <div role="note" className="rounded-lg border bg-muted/40 p-4 text-sm space-y-1">
                <div className="flex items-center gap-2 font-medium">
                    <Badge variant="secondary">{t('badge.readOnly')}</Badge>
                    {t('banner.title')}
                </div>
                <p className="text-muted-foreground">
                    {t('banner.body')}
                </p>
                <p className="text-muted-foreground">
                    {stats.documents} {t('fields.documents')}
                    {stats.withoutFile > 0 && (
                        <>
                            {' · '}
                            <span className="text-amber-600">
                                {stats.withoutFile} {t('stats.withoutFile')}
                            </span>
                        </>
                    )}
                </p>
                <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={hideEmpty}
                        onChange={(e) => setHideEmpty(e.target.checked)}
                    />
                    {t('filters.hideEmpty')}
                </label>
            </div>

            <VerificationNotice verification={verification} />
            <TemplateOriginNotice origin={templateOrigin} />

            <div className="space-y-6">
                {data.groups.map((group, gi) => (
                    <details key={gi} open className="group/g">
                        <summary className="list-none cursor-pointer">
                            <div className="flex flex-wrap justify-between items-center gap-2 bg-muted/60 p-3 rounded-lg border">
                                <span className="font-bold text-base flex items-center gap-2">
                                    <ChevronRight className="h-4 w-4 transition-transform group-open/g:rotate-90" />
                                    {group.name}
                                </span>
                                <div className="flex items-center gap-2">
                                    {group.min_points != null && (
                                        <span className="text-xs text-muted-foreground">
                                            {t('fields.min')} {pts(group.min_points)}
                                        </span>
                                    )}
                                    {group.score.bonus != null && group.score.bonus > 0 && (
                                        <Badge variant="secondary">
                                            +{pts(group.score.bonus)} {t('fields.bonus')}
                                        </Badge>
                                    )}
                                    {group.score.completion && (
                                        <Badge variant="secondary">{completionLabel(group.score.completion)}</Badge>
                                    )}
                                    <MismatchTag items={flagged.get(keyOf.group(gi))} />
                                    <span className="font-bold text-sm">{pts(group.score.total)} pts</span>
                                </div>
                            </div>
                        </summary>

                        <div className="space-y-4 pl-2 pt-4">
                            {group.subgroups.map((sub, si) => (
                                <details key={si} open className="group/s border rounded-lg p-4">
                                    <summary className="list-none cursor-pointer">
                                        <div className="flex flex-wrap justify-between items-center gap-2 bg-muted/40 p-2.5 rounded">
                                            <span className="font-semibold text-sm flex items-center gap-2">
                                                <ChevronRight className="h-4 w-4 transition-transform group-open/s:rotate-90" />
                                                {sub.name}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                {sub.max_points != null && (
                                                    <span className="text-xs text-muted-foreground">
                                                        {t('fields.max')} {pts(sub.max_points)}
                                                    </span>
                                                )}
                                                {sub.score.completion && (
                                                    <Badge variant="secondary">{completionLabel(sub.score.completion)}</Badge>
                                                )}
                                                {sub.score.raw_total !== sub.score.total && (
                                                    <span className="text-xs text-muted-foreground">
                                                        {t('fields.earned')} {pts(sub.score.raw_total)} →{' '}
                                                        {t('fields.counted')}
                                                    </span>
                                                )}
                                                <MismatchTag items={flagged.get(keyOf.subgroup(gi, si))} />
                                                <span className="font-bold text-sm">{pts(sub.score.total)} pts</span>
                                            </div>
                                        </div>
                                    </summary>

                                    <div className="space-y-3 pl-2 pt-3">
                                        {sub.categories
                                            .filter((c) => !hideEmpty || c.documents.length > 0)
                                            .map((cat, ci) => (
                                                <div key={ci} className="text-sm border-l-2 pl-3 py-1 space-y-1">
                                                    <div className="flex justify-between gap-4 font-medium">
                                                        <span>{cat.name}</span>
                                                        <span className="shrink-0">
                                                            <MismatchTag items={flagged.get(keyOf.category(gi, si, ci))} />{' '}
                                                            {pts(cat.score.total)} pts
                                                            {cat.score.capped && (
                                                                <span className="text-xs text-muted-foreground">
                                                                    {' '}
                                                                    ({t('fields.capped')} {pts(cat.score.raw_total)})
                                                                </span>
                                                            )}
                                                        </span>
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {t('fields.rule')}: {describeRule(cat.rule)}
                                                    </div>

                                                    {cat.documents.length > 0 && (
                                                        <div className="space-y-1 pt-1">
                                                            {cat.documents.map((doc, di) => (
                                                                <div
                                                                    key={di}
                                                                    className="flex items-center justify-between gap-3 text-xs text-muted-foreground bg-muted/20 p-2 rounded border"
                                                                >
                                                                    <div className="flex items-start gap-2 min-w-0">
                                                                        {doc.has_file ? (
                                                                            <Paperclip
                                                                                className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0"
                                                                                aria-label={t('doc.hasFile')}
                                                                            />
                                                                        ) : (
                                                                            <AlertCircle
                                                                                className="h-3.5 w-3.5 mt-0.5 text-amber-500 shrink-0"
                                                                                aria-label={t('doc.noFile')}
                                                                            />
                                                                        )}
                                                                        <div className="min-w-0">
                                                                            <div className="text-foreground break-words">
                                                                                {doc.title}{' '}
                                                                                <span className="text-muted-foreground">
                                                                                    ({doc.hours != null ? `${doc.hours}h` : `${doc.quantity}x`})
                                                                                </span>
                                                                            </div>
                                                                            <div>
                                                                                {fmtDate(doc.issued_at)}
                                                                                {doc.file_name && ` · ${doc.file_name}`}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <span className="shrink-0 text-right">
                                                                        <MismatchTag items={flagged.get(keyOf.document(gi, si, ci, di))} />{' '}
                                                                        <span className="font-mono font-medium text-foreground">
                                                                            +{pts(doc.points)} pts
                                                                        </span>
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                    </div>
                                </details>
                            ))}
                        </div>
                    </details>
                ))}
            </div>
        </div>
    )
}