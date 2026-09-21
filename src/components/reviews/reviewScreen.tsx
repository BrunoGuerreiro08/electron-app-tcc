import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Eye, FileUp, Trash2, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useReviewsStore } from '@/store/reviewStore'
import {
    summarizeExport,
    validateCollectionExport,
} from '@/services/collectionImport/validateExport'
import { verifySnapshotScores } from '@/services/collectionImport/verifyScores'
import { VerificationNotice } from './verificationNotice'
import type { ReviewSnapshot } from '@/types/review'

const MAX_FILE_BYTES = 10 * 1024 * 1024

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR')

interface Pending {
    data: ReviewSnapshot
    fileName: string
}

export function ReviewsScreen() {
    const { t } = useTranslation('reviews')
    const navigate = useNavigate()
    const { items, loading, load, importReview, remove } = useReviewsStore()

    const fileInput = useRef<HTMLInputElement>(null)
    const [pending, setPending] = useState<Pending | null>(null)
    const [errors, setErrors] = useState<string[]>([])
    const [busy, setBusy] = useState(false)
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

    useEffect(() => {
        load()
    }, [load])

    const handleFile = async (file: File) => {
        setPending(null)
        setErrors([])

        if (file.size > MAX_FILE_BYTES) {
            setErrors([t('errors.tooLarge', 'O arquivo é maior que 10 MB — não parece ser uma exportação de coleção.')])
            return
        }

        let parsed: unknown
        try {
            parsed = JSON.parse(await file.text())
        } catch {
            setErrors([t('errors.notJson', 'O arquivo não é um JSON válido.')])
            return
        }

        const result = validateCollectionExport(parsed)
        if (!result.ok) {
            setErrors(result.errors)
            return
        }
        // Nothing is saved yet: the user reviews what they're about to import first.
        setPending({ data: result.data, fileName: file.name })
    }

    const confirmImport = async () => {
        if (!pending) return
        try {
            setBusy(true)
            const id = await importReview(pending.data, pending.fileName)
            setPending(null)
            navigate(`/reviews/${id}`)
        } catch (err) {
            console.error('Import failed:', err)
            setErrors([t('errors.saveFailed', 'Não foi possível salvar a revisão. Tente novamente.')])
        } finally {
            setBusy(false)
        }
    }

    const pendingSummary = pending ? summarizeExport(pending.data) : null
    // Recalculate with this app's engine BEFORE saving, so the reviewer sees the result up front.
    const pendingVerification = useMemo(
        () => (pending ? verifySnapshotScores(pending.data) : null),
        [pending]
    )
    const alreadyImported = pendingSummary
        ? items.find(
            (i) =>
                i.summary.name === pendingSummary.name &&
                i.summary.exportedAt === pendingSummary.exportedAt &&
                i.summary.senderEmail === pendingSummary.senderEmail
        )
        : undefined

    return (
        <div className="space-y-6 p-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold flex items-center gap-2">
                        <Eye className="h-6 w-6 text-primary" />
                        {t('title', 'Revisões')}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {t(
                            'description',
                            'Coleções recebidas de outros usuários para conferência. São cópias somente leitura.'
                        )}
                    </p>
                </div>

                <div>
                    <input
                        ref={fileInput}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={(e) => {
                            const file = e.target.files?.[0]
                            e.target.value = '' // allow re-selecting the same file
                            if (file) void handleFile(file)
                        }}
                    />
                    <Button onClick={() => fileInput.current?.click()} disabled={busy} className="gap-2">
                        <FileUp className="h-4 w-4" />
                        {t('actions.import', 'Importar coleção (.json)')}
                    </Button>
                </div>
            </div>

            {errors.length > 0 && (
                <Card className="border-destructive/50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base text-destructive">
                            {t('errors.title', 'Não foi possível importar este arquivo')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul role="alert" className="list-disc pl-5 space-y-1 text-sm">
                            {errors.map((e, i) => (
                                <li key={i}>{e}</li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {pending && pendingSummary && (
                <Card className="border-primary/40">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base">
                            {t('confirm.title', 'Confirme a importação')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-sm">
                            <dt className="text-muted-foreground">{t('fields.collection', 'Coleção')}</dt>
                            <dd className="font-medium">{pendingSummary.name}</dd>
                            <dt className="text-muted-foreground">{t('fields.sender', 'Enviada por')}</dt>
                            <dd>
                                {pendingSummary.senderName
                                    ? `${pendingSummary.senderName}${pendingSummary.senderEmail ? ` (${pendingSummary.senderEmail})` : ''}`
                                    : t('fields.senderUnknown', 'Remetente não informado')}
                            </dd>
                            <dt className="text-muted-foreground">{t('fields.exportedAt', 'Exportada em')}</dt>
                            <dd>{fmtDateTime(pendingSummary.exportedAt)}</dd>
                            <dt className="text-muted-foreground">{t('fields.content', 'Conteúdo')}</dt>
                            <dd>
                                {pendingSummary.groupCount} {t('fields.groups', 'grupos')} ·{' '}
                                {pendingSummary.documentCount} {t('fields.documents', 'documentos')} ·{' '}
                                {pendingSummary.totalScore.toFixed(2)} pts
                            </dd>
                        </dl>

                        {pendingVerification && <VerificationNotice verification={pendingVerification} />}

                        {alreadyImported && (
                            <p className="text-sm text-amber-600">
                                {t('confirm.duplicate', 'Esta versão já foi importada em')}{' '}
                                {fmtDateTime(alreadyImported.importedAt)}.
                            </p>
                        )}

                        <p className="text-xs text-muted-foreground">
                            {t(
                                'confirm.note',
                                'A cópia importada é somente leitura e não é misturada com as suas coleções.'
                            )}
                        </p>

                        <div className="flex gap-2">
                            <Button onClick={confirmImport} disabled={busy}>
                                {busy
                                    ? t('actions.importing', 'Importando…')
                                    : pendingVerification?.status === 'mismatch'
                                        ? t('actions.importAnyway', 'Importar mesmo assim')
                                        : t('actions.confirmImport', 'Importar')}
                            </Button>
                            <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>
                                {t('actions.cancel', 'Cancelar')}
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {items.length === 0 && !loading ? (
                <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
                    <Eye className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="font-medium">{t('empty.title', 'Nenhuma revisão importada')}</p>
                    <p className="text-sm">
                        {t(
                            'empty.description',
                            'Importe um arquivo .json exportado por outro usuário para conferir a coleção dele.'
                        )}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {items.map((item) => (
                        <Card key={item.id}>
                            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="min-w-0 space-y-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-semibold truncate">{item.summary.name}</span>
                                        <Badge variant="secondary">{t('badge.readOnly', 'Somente leitura')}</Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {item.summary.senderName ?? t('fields.senderUnknown', 'Remetente não informado')}
                                        {' · '}
                                        {t('fields.exportedAt', 'Exportada em')} {fmtDateTime(item.summary.exportedAt)}
                                        {' · '}
                                        {item.summary.documentCount} {t('fields.documents', 'documentos')}
                                        {' · '}
                                        {item.summary.totalScore.toFixed(2)} pts
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                        {t('fields.importedAt', 'Importada em')} {fmtDateTime(item.importedAt)}
                                    </p>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    <Button size="sm" className="gap-2" onClick={() => navigate(`/reviews/${item.id}`)}>
                                        <FolderOpen className="h-4 w-4" />
                                        {t('actions.open', 'Abrir')}
                                    </Button>

                                    {confirmDeleteId === item.id ? (
                                        <>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={async () => {
                                                    await remove(item.id)
                                                    setConfirmDeleteId(null)
                                                }}
                                            >
                                                {t('actions.confirmDelete', 'Excluir cópia?')}
                                            </Button>
                                            <Button size="sm" variant="outline" onClick={() => setConfirmDeleteId(null)}>
                                                {t('actions.cancel', 'Cancelar')}
                                            </Button>
                                        </>
                                    ) : (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            title={t('actions.delete', 'Excluir cópia importada')}
                                            onClick={() => setConfirmDeleteId(item.id)}
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}