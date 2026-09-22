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
import { useTranslation } from 'react-i18next'

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
    const { t } = useTranslation(['common', 'reports'])
    // Collect all unique attached file paths across categories
    const getAllAttachmentPaths = (): string[] => {
        const paths: string[] = []
        reportData.groups.forEach((s) => {
            s.subgroups.forEach((c) => {
                c.categories.forEach((c) => {
                    c.documents.forEach((d) => {

                        if (d.filePath) {
                            paths.push(d.filePath)
                        }
                    })
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
                        <span>{t('reports.preview.title')}</span>
                        <Badge variant="outline" className="text-base font-bold text-primary">
                            {t('reports.preview.totalScore', { score: reportData.totalScore.toFixed(2) })}
                        </Badge>
                    </DialogTitle>
                </DialogHeader>

                {/* Preview View Area */}
                <div className="flex-1 overflow-y-auto space-y-6 pr-2 my-2">
                    <div className="flex justify-between border-b pb-3 text-sm text-muted-foreground">
                        <div>
                            <span className="font-semibold text-foreground">{t('reports.preview.collection')}:</span>{' '}
                            {reportData.collectionName}
                        </div>
                        <div>
                            <span className="font-semibold text-foreground">{t('reports.preview.professor')}:</span>{' '}
                            {reportData.userName}
                        </div>
                    </div>

                    {reportData.groups.map((group) => group.subgroups.map((subgroup) => (
                        <div key={subgroup.id} className="border rounded-lg p-4 space-y-3">
                            <div className="flex justify-between items-center bg-muted/40 p-2 rounded">
                                <h4 className="font-semibold text-sm">{subgroup.name}</h4>
                                <div className="flex items-center gap-2">
                                    <Badge>{subgroup.completion || t('reports.preview.noGoal')}</Badge>
                                    <span className="font-bold text-sm">
                                        {t('reports.preview.pointsSuffix', { count: subgroup.total.toFixed(2) })}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-3 pl-2">
                                {subgroup.categories.map((cat) => (
                                    <div key={cat.id} className="text-sm border-l-2 pl-3 py-1">
                                        <div className="flex justify-between font-medium">
                                            <span>{cat.name}</span>
                                            <span>{t('reports.preview.pointsSuffix', { count: cat.total.toFixed(2) })}</span>
                                        </div>

                                        {cat.documents.length > 0 ? (
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
                                                            +{t('reports.preview.pointsSuffix', { count: doc.points.toFixed(2) })}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="mt-2 text-xs text-muted-foreground italic">
                                                {t('reports.preview.noDocuments')}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )))}
                </div>

                <DialogFooter className="gap-2 border-t pt-3">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('common.actions.cancel')}
                    </Button>
                    <Button onClick={handleExportDossier} disabled={isExporting}>
                        {isExporting ? t('common.actions.generatingDossier') : t('common.actions.exportDossier')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}