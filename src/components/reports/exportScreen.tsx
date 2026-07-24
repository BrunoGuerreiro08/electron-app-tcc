import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useCollectionsStore } from '@/store/collectionsStore'
import { useCollectionDetail } from '@/hooks/useCollectionDetail'
import { useAuthStore } from '@/store/authStore'
import { buildReportData } from '@/services/reportEngine/reportDataMapper'
import { generateReportHtml } from '@/services/reportEngine/generateReportHtml'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Printer, Download, FileText, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react'

export function ExportScreen() {
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

    const { subgroups, score, loading } = useCollectionDetail(selectedCollectionId)
    const [isExporting, setIsExporting] = useState(false)

    useEffect(() => {
        loadCollections()
    }, [loadCollections])

    const handleSelectCollection = (id: string) => {
        setSelectedCollectionId(id)
        navigate(`/collections/${id}/report`, { replace: true })
    }

    const currentCollection = collections.find((c) => c.id === selectedCollectionId)

    const mappedSubgroups = subgroups.map((sg) => ({
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
    }))

    const reportData =
        currentCollection && score
            ? buildReportData(
                {
                    id: currentCollection.id,
                    name: currentCollection.name,
                    subgroups: mappedSubgroups,
                },
                score,
                session?.user
            )
            : null

    const handleExportDossier = async () => {
        if (!reportData) return

        try {
            setIsExporting(true)
            const htmlContent = generateReportHtml(reportData)

            const attachmentPaths: string[] = []
            reportData.subgroups.forEach((s) => {
                s.categories.forEach((c) => {
                    c.documents.forEach((d) => {
                        if (d.filePath) attachmentPaths.push(d.filePath)
                    })
                })
            })

            const uniquePaths = Array.from(new Set(attachmentPaths))
            const suggestedFilename = `${reportData.collectionName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Dossier.pdf`

            await window.api.reports.exportDossier({
                reportHtml: htmlContent,
                attachmentPaths: uniquePaths,
                suggestedFilename,
            })
        } catch (err) {
            console.error('Export failed:', err)
        } finally {
            setIsExporting(false)
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
                            title="Voltar para a Coleção"
                        >
                            <ArrowLeft className="h-5 w-5" />
                        </Button>
                    )}
                    <div>
                        <h1 className="text-2xl font-semibold flex items-center gap-2">
                            <Printer className="h-6 w-6 text-primary" />
                            Relatório & Exportação
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Gere relatórios consolidados e compilações em PDF com seus comprovantes.
                        </p>
                    </div>
                </div>

                {reportData && (
                    <Button onClick={handleExportDossier} disabled={isExporting} className="gap-2">
                        <Download className="h-4 w-4" />
                        {isExporting ? 'Gerando Dossiê...' : 'Exportar Dossiê (.pdf)'}
                    </Button>
                )}
            </div>

            {/* Collection Selector */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-base font-medium">Coleção Selecionada</CardTitle>
                </CardHeader>
                <CardContent>
                    <Select value={selectedCollectionId} onValueChange={handleSelectCollection}>
                        <SelectTrigger className="w-full sm:w-[350px]">
                            <SelectValue placeholder="Escolha uma coleção para exportar..." />
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
                    <p className="font-medium">Nenhuma coleção selecionada</p>
                    <p className="text-sm">Selecione uma coleção acima para visualizar o relatório.</p>
                </div>
            ) : loading ? (
                <div className="p-12 text-center text-sm text-muted-foreground">
                    Carregando dados da coleção...
                </div>
            ) : reportData ? (
                <Card>
                    <CardHeader className="border-b bg-muted/20 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-lg">{reportData.collectionName}</CardTitle>
                            <p className="text-xs text-muted-foreground mt-1">
                                Docente: {reportData.userName} | Emissão: {reportData.generatedAt}
                            </p>
                        </div>
                        <Badge variant="outline" className="text-base font-bold text-primary px-3 py-1">
                            {reportData.totalScore.toFixed(2)} pts
                        </Badge>
                    </CardHeader>
                    <CardContent className="p-6 space-y-6">
                        {reportData.subgroups.map((subgroup) => (
                            <div key={subgroup.id} className="border rounded-lg p-4 space-y-3">
                                <div className="flex justify-between items-center bg-muted/40 p-2.5 rounded">
                                    <span className="font-semibold text-sm">{subgroup.name}</span>
                                    <div className="flex items-center gap-3">
                                        <Badge variant="secondary">{subgroup.completion || 'Sem meta'}</Badge>
                                        <span className="font-bold text-sm">{subgroup.total.toFixed(2)} pts</span>
                                    </div>
                                </div>

                                <div className="space-y-3 pl-2">
                                    {subgroup.categories.map((cat) => (
                                        <div key={cat.id} className="text-sm border-l-2 pl-3 py-1 space-y-1">
                                            <div className="flex justify-between font-medium">
                                                <span>{cat.name}</span>
                                                <span>
                                                    {cat.total.toFixed(2)} pts{' '}
                                                    {cat.capped && <span className="text-xs text-muted-foreground">(Teto)</span>}
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
                                                                +{doc.points.toFixed(2)} pts
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="text-xs text-muted-foreground italic">Sem documentos associados</div>
                                            )}
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