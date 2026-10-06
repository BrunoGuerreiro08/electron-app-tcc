import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useCollectionsStore } from '@/store/collectionsStore'
import { useCollectionDetail } from '@/hooks/useCollectionDetail'
import { useAuthStore } from '@/store/authStore'
import { buildReportData } from '@/services/reportEngine/reportDataMapper'
// import { generateReportHtml } from '@/services/reportEngine/generateReportHtml'
import { exportReportData, type DataExportFormat } from '@/services/reportEngine/exporters'
import { exportDossier } from '@/services/dossierExport'
import type { DossierMode } from '@/services/dossierExport/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
    Printer,
    Download,
    FileText,
    FileJson,
    FileSpreadsheet,
    FolderArchive,
    Files,
    CheckCircle,
    AlertCircle,
    ArrowLeft,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatPoints } from '@/lib/formatPoints'

export function ExportScreen() {
    const { t } = useTranslation(['common', 'reports'])
    const { collectionId: urlCollectionId } = useParams<{ collectionId?: string }>()
    const navigate = useNavigate()

    const { collections, load: loadCollections } = useCollectionsStore()
    const session = useAuthStore((s) => s.session)

    const [selectedCollectionId, setSelectedCollectionId] = useState<string>(urlCollectionId || '')

    // Keep state in sync if URL param changes
    useEffect(() => {
        if (urlCollectionId) {
            setSelectedCollectionId(urlCollectionId)
        }
    }, [urlCollectionId])

    const { groups, score, loading } = useCollectionDetail(selectedCollectionId)
    // Single "busy" slot shared by every format so two exports can never run at once (NFR-09-07).
    const [exporting, setExporting] = useState<'pdf' | DataExportFormat | DossierMode | null>(null)
    const [dossierNotice, setDossierNotice] = useState<string | null>(null)
    const [exportError, setExportError] = useState<string | null>(null)
    const isExporting = exporting !== null

    useEffect(() => {
        loadCollections()
    }, [loadCollections])

    const handleSelectCollection = (id: string) => {
        setSelectedCollectionId(id)
        navigate(`/collections/${id}/report`, { replace: true })
    }

    const currentCollection = collections.find((c) => c.id === selectedCollectionId)

    const mappedGroups = groups.map((g) => ({
        id: g.id,
        name: g.name,
        minPoints: g.min_points,
        maxPoints: g.max_points,
        bonusRate: g.bonus_rate,
        subgroups: g.subgroups.map((sg) => ({
            id: sg.id,
            name: sg.name,
            minPoints: sg.min_points,
            maxPoints: sg.max_points,
            categories: sg.categories.map((cat) => ({
                id: cat.id,
                name: cat.name,
                rule: cat.rule,
                documents: cat.documents.map((doc) => ({
                    id: doc.id,
                    title: doc.title,
                    issuedAt: doc.issued_at,
                    quantity: doc.quantity,
                    hours: doc.hours,
                    filePath: doc.file_path ?? null,
                })),
            })),
        })),
    }))

    const reportData =
        currentCollection && score
            ? buildReportData(
                {
                    id: currentCollection.id,
                    name: currentCollection.name,
                    groups: mappedGroups,
                },
                score,
                session?.user
            )
            : null

    // Documents grouped/stitched by category, or kept individual — see dossierExport.
    // Runs against the SAME local ReportData (still carrying real file paths) as
    // everything else on this screen; never available for an imported/reviewed
    // collection, which has no file paths at all.
    const handleExportDocumentsBundle = async (mode: DossierMode) => {
        if (!reportData) return
        try {
            setExporting(mode)
            setExportError(null)
            setDossierNotice(null)
            const outcome = await exportDossier(reportData, mode, 'zip')
            if (outcome.cancelled) return

            const { plan, result } = outcome
            const parts = [
                t('reports:dossier.written', {
                    defaultValue: '{{n}} arquivo(s) gerado(s)',
                    n: result?.entriesWritten ?? 0,
                }),
            ]
            if (plan && plan.skipped.length > 0)
                parts.push(
                    t('reports:dossier.skipped', {
                        defaultValue: '{{n}} documento(s) sem arquivo, ignorado(s)',
                        n: plan.skipped.length,
                    })
                )
            if (result && result.failures.length > 0)
                parts.push(
                    t('reports:dossier.failed', {
                        defaultValue: '{{n}} arquivo(s) não encontrado(s) no disco',
                        n: result.failures.length,
                    })
                )
            setDossierNotice(parts.join(' · '))
        } catch (err) {
            console.error(`Dossier export (${mode}) failed:`, err)
            setExportError(t('reports:errors.exportFailed'))
        } finally {
            setExporting(null)
        }
    }

    // JSON / XLSX / CSV all use the same reportData snapshot as the preview and the PDF.
    const handleExportData = async (format: DataExportFormat) => {
        if (!reportData) return

        try {
            setExporting(format)
            setExportError(null)
            await exportReportData(format, reportData)
        } catch (err) {
            console.error(`Export (${format}) failed:`, err)
            setExportError(t('reports:errors.exportFailed'))
        } finally {
            setExporting(null)
        }
    }

    return (
        <div className="space-y-6 p-6 max-w-5xl mx-auto">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    {selectedCollectionId && (
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate(`/collections/${selectedCollectionId}`)}
                            title={t('actions.backToCollection')}
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    )}
                    <div>
                        <h1 className="text-2xl font-semibold flex items-center gap-2">
                            <Printer className="h-6 w-6 text-primary" />
                            {t('reports:title')}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {t('reports:description')}
                        </p>
                    </div>
                </div>

                {reportData && (
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={() => handleExportData('pdf')}
                            disabled={isExporting}
                            className="gap-2"
                        >
                            <Download className="h-4 w-4" />
                            {exporting === 'pdf' ? t('actions.generatingDossier') : t('actions.exportPdf', 'PDF')}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleExportData('xlsx')}
                            disabled={isExporting}
                            className="gap-2"
                        >
                            <FileSpreadsheet className="h-4 w-4" />
                            {t('actions.exportXlsx')}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleExportData('csv')}
                            disabled={isExporting}
                            className="gap-2"
                        >
                            <FileText className="h-4 w-4" />
                            {t('actions.exportCsv')}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleExportData('json')}
                            disabled={isExporting}
                            className="gap-2"
                        >
                            <FileJson className="h-4 w-4" />
                            {t('actions.exportJson')}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleExportDocumentsBundle('stitched')}
                            disabled={isExporting}
                            className="gap-2"
                            title={t('reports:dossier.stitchedHint')}
                        >
                            <FolderArchive className="h-4 w-4" />
                            {exporting === 'stitched'
                                ? t('actions.generatingDossier')
                                : t('actions.exportDocsStitched')}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleExportDocumentsBundle('individual')}
                            disabled={isExporting}
                            className="gap-2"
                            title={t('reports:dossier.individualHint')}
                        >
                            <Files className="h-4 w-4" />
                            {exporting === 'individual'
                                ? t('actions.generatingDossier')
                                : t('actions.exportDocsIndividual')}
                        </Button>
                    </div>
                )}
            </div>

            {dossierNotice && (
                <p className="text-sm text-muted-foreground">{dossierNotice}</p>
            )}

            {exportError && (
                <p role="alert" className="text-sm text-destructive">
                    {exportError}
                </p>
            )}

            {/* Collection Selector */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base font-medium">{t('reports:selector.title')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <Select value={selectedCollectionId} onValueChange={handleSelectCollection}>
                        <SelectTrigger className="w-full sm:w-[350px]">
                            <SelectValue placeholder={t('reports:selector.placeholder')} />
                        </SelectTrigger>
                        <SelectContent>
                            {collections.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                    {c.name}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </CardContent>
            </Card>

            {/* Report Preview */}
            {!selectedCollectionId ? (
                <div className="border border-dashed rounded-lg p-12 text-center text-muted-foreground">
                    <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                    <p className="font-medium">{t('reports:emptyState.title')}</p>
                    <p className="text-sm">{t('reports:emptyState.description')}</p>
                </div>
            ) : loading ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                    {t('states.loadingCollectionData')}
                </div>
            ) : reportData ? (
                <Card>
                    <CardHeader className="border-b bg-muted/20 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-lg">{reportData.collectionName}</CardTitle>
                            <p className="text-xs text-muted-foreground mt-1">
                                {t('reports:professor')}: {reportData.userName} | {t('issuedAt')}: {reportData.generatedAt}
                            </p>
                        </div>
                        <Badge variant="outline" className="text-base font-bold text-primary px-3 py-1">
                            {t('reports:preview.totalScore', { score: formatPoints(reportData.totalScore) })}
                        </Badge>
                    </CardHeader>
                    <CardContent className="p-6 space-y-8">
                        {reportData.groups.map((group) => (
                            <div key={group.id} className="space-y-4">
                                <div className="flex justify-between items-center bg-muted/60 p-3 rounded-lg border">
                                    <span className="font-bold text-base">{group.name}</span>
                                    <div className="flex items-center gap-3">
                                        {group.bonus != null && group.bonus > 0 && (
                                            <Badge variant="secondary">
                                                +{formatPoints(group.bonus)} {t('reports:preview.bonus')}
                                            </Badge>
                                        )}
                                        <Badge variant="secondary">{group.completion || t('reports:preview.noGoal')}</Badge>
                                        <span className="font-bold text-sm">
                                            {t('reports:preview.pointsSuffix', { count: formatPoints(group.total) })}
                                        </span>
                                    </div>
                                </div>

                                <div className="space-y-6 pl-2">
                                    {group.subgroups.map((subgroup) => (
                                        <div key={subgroup.id} className="border rounded-lg p-4 space-y-3">
                                            <div className="flex justify-between items-center bg-muted/40 p-2.5 rounded">
                                                <span className="font-semibold text-sm">{subgroup.name}</span>
                                                <div className="flex items-center gap-3">
                                                    <Badge variant="secondary">{subgroup.completion || t('reports:preview.noGoal')}</Badge>
                                                    <span className="font-bold text-sm">{t('reports:preview.pointsSuffix', { count: formatPoints(subgroup.total) })}</span>
                                                </div>
                                            </div>

                                            <div className="space-y-3 pl-2">
                                                {subgroup.categories.map((cat) => (
                                                    <div key={cat.id} className="text-sm border-l-2 pl-3 py-1 space-y-1">
                                                        <div className="flex justify-between font-medium">
                                                            <span>{cat.name}</span>
                                                            <span>
                                                                {formatPoints(cat.total)} pts{' '}
                                                                {cat.capped && <span className="text-xs text-muted-foreground">{t('reports:preview.capped')}</span>}
                                                            </span>
                                                        </div>

                                                        {cat.documents.length > 0 ? (
                                                            <div className="space-y-1 pt-1">
                                                                {cat.documents.map((doc) => (
                                                                    <div
                                                                        key={doc.id}
                                                                        className="flex items-center justify-between text-xs text-muted-foreground bg-muted/20 p-2 rounded border"
                                                                    >
                                                                        <div className="flex items-center gap-2">
                                                                            {doc.hasFile ? (
                                                                                <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                                                            ) : (
                                                                                <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                                                                            )}
                                                                            <span>
                                                                                {doc.title} ({doc.hours ? `${doc.hours}h` : `${doc.quantity}x`})
                                                                            </span>
                                                                        </div>
                                                                        <span className="font-mono font-medium text-foreground">
                                                                            +{formatPoints(doc.points)} pts
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="text-xs text-muted-foreground italic">{t('reports:preview.noGoal')}</div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            ) : null}
        </div>
    )
}