import React, { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ReportData } from '@/services/reportEngine/types'
import { generateReportHtml } from '@/services/reportEngine/generateReportHtml'

interface ReportPreviewModalProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    reportData: ReportData
}

export const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({
    open,
    onOpenChange,
    reportData,
}) => {
    const [isExporting, setIsExporting] = useState(false)

    // Collect all unique attached file paths across categories
    const getAllAttachmentPaths = (): string[] => {
        const paths: string[] = []
        reportData.subgroups.forEach((s) => {
            s.categories.forEach((c) => {
                c.documents.forEach((d) => {
                    if (d.filePath) {
                        paths.push(d.filePath)
                    }
                })
            })
        })
        return Array.from(new Set(paths))
    }

    const handleExportDossier = async () => {
        try {
            setIsExporting(true)
            const htmlContent = generateReportHtml(reportData)
            const attachmentPaths = getAllAttachmentPaths()

            const suggestedFilename = `${reportData.collectionName.replace(/[^a-zA-Z0-9_-]/g, '_')}_Dossier.pdf`

            // Call main process IPC handler
            const result = await window.api.reports.exportDossier({
                reportHtml: htmlContent,
                attachmentPaths,
                suggestedFilename,
            })

            if (result.success) {
                onOpenChange(false)
            }
        } catch (err) {
            console.error('Export failed:', err)
        } finally {
            setIsExporting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex justify-between items-center pr-6">
                        <span>Pré-visualização do Relatório</span>
                        <Badge variant="outline" className="text-base font-bold text-primary">
                            Total: {reportData.totalScore.toFixed(2)} pts
                        </Badge>
                    </DialogTitle>
                </DialogHeader>

                {/* Preview View Area */}
                <div className="flex-1 overflow-y-auto space-y-6 pr-2 my-2">
                    <div className="flex justify-between border-b pb-3 text-sm text-muted-foreground">
                        <div>
                            <span className="font-semibold text-foreground">Coleção:</span>{' '}
                            {reportData.collectionName}
                        </div>
                        <div>
                            <span className="font-semibold text-foreground">Docente:</span>{' '}
                            {reportData.userName}
                        </div>
                    </div>

                    {reportData.subgroups.map((subgroup) => (
                        <div key={subgroup.id} className="border rounded-lg p-4 space-y-3">
                            <div className="flex justify-between items-center bg-muted/40 p-2 rounded">
                                <h4 className="font-semibold text-sm">{subgroup.name}</h4>
                                <div className="flex items-center gap-2">
                                    <Badge>{subgroup.completion || 'Sem meta'}</Badge>
                                    <span className="font-bold text-sm">
                                        {subgroup.total.toFixed(2)} pts
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-3 pl-2">
                                {subgroup.categories.map((cat) => (
                                    <div key={cat.id} className="text-sm border-l-2 pl-3 py-1">
                                        <div className="flex justify-between font-medium">
                                            <span>{cat.name}</span>
                                            <span>{cat.total.toFixed(2)} pts</span>
                                        </div>

                                        {cat.documents.length > 0 && (
                                            <div className="mt-2 space-y-1">
                                                {cat.documents.map((doc) => (
                                                    <div
                                                        key={doc.id}
                                                        className="flex justify-between text-xs text-muted-foreground bg-background p-1.5 rounded border"
                                                    >
                                                        <span>
                                                            {doc.title} ({doc.hours ? `${doc.hours}h` : `${doc.quantity}x`})
                                                        </span>
                                                        <span className="font-mono font-medium text-foreground">
                                                            +{doc.points.toFixed(2)} pts
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <DialogFooter className="gap-2 border-t pt-3">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={handleExportDossier} disabled={isExporting}>
                        {isExporting ? 'Gerando Dossiê...' : 'Exportar Dossiê Consolidado (.pdf)'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}