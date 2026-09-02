import { useEffect, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { documentRepository } from '@/repository/documentRepository'
import type { ScannedFile } from '@/types/entities'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type Step = 'review' | 'importing' | 'done'

interface ReviewRow extends ScannedFile {
    title: string
    selected: boolean
}

function titleFromFilename(name: string): string {
    const withoutExt = name.replace(/\.[^/.]+$/, '')
    return withoutExt.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    files: ScannedFile[]
    onImported: () => void
}

export function NewFilesDialog({ open, onOpenChange, files, onImported }: Props) {
    const { t } = useTranslation('documents')
    const [step, setStep] = useState<Step>('review')
    const [rows, setRows] = useState<ReviewRow[]>([])
    const [summary, setSummary] = useState<{ imported: number; failed: number } | null>(null)

    useEffect(() => {
        if (open) {
            setStep('review')
            setSummary(null)
            setRows(
                files.map((f) => ({
                    ...f,
                    title: titleFromFilename(f.name),
                    selected: f.valid,
                }))
            )
        }
    }, [open, files])

    const toggleRow = (path: string, checked: boolean) => {
        setRows((prev) => prev.map((r) => (r.path === path ? { ...r, selected: checked } : r)))
    }

    const updateTitle = (path: string, title: string) => {
        setRows((prev) => prev.map((r) => (r.path === path ? { ...r, title } : r)))
    }

    const selectedRows = rows.filter((r) => r.valid && r.selected)
    const validCount = rows.filter((r) => r.valid).length
    const invalidCount = rows.length - validCount

    const handleImport = async () => {
        setStep('importing')
        const results = await documentRepository.bulkImport(
            selectedRows.map((r) => ({ fileName: r.name, title: r.title.trim() || r.name }))
        )
        const imported = results.filter((r) => r.ok).length
        setSummary({ imported, failed: results.length - imported })
        setStep('done')
        onImported()
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('newFiles.title')}</DialogTitle>
                    <DialogDescription>
                        {t('newFiles.description')}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex h-[420px] flex-col">
                    {step === 'review' && (
                        <div className="flex flex-1 flex-col space-y-3 overflow-hidden">
                            <div className="flex items-center justify-between text-sm text-muted-foreground">
                                <span>{t('newFiles.status.found', { count: rows.length })}</span>
                                <span className="shrink-0">
                                    {t('newFiles.status.ready', { count: validCount })}
                                    {invalidCount > 0 && `, ${t('newFiles.status.flagged', { count: invalidCount })}`}
                                </span>
                            </div>

                            <div className="flex-1 overflow-y-auto rounded-md border">
                                {rows.map((row) => (
                                    <div
                                        key={row.path}
                                        className={`flex items-center gap-3 border-b p-2 last:border-b-0 ${!row.valid ? 'opacity-60' : ''
                                            }`}
                                    >
                                        <Checkbox
                                            checked={row.selected}
                                            disabled={!row.valid}
                                            onCheckedChange={(checked) => toggleRow(row.path, checked === true)}
                                        />
                                        {row.valid ? (
                                            <Input
                                                value={row.title}
                                                onChange={(e) => updateTitle(row.path, e.target.value)}
                                                className="h-8 flex-1"
                                            />
                                        ) : (
                                            <span className="flex-1 truncate text-sm">{row.name}</span>
                                        )}
                                        {row.valid ? (
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        ) : (
                                            <Badge variant="destructive" className="shrink-0 gap-1 text-xs">
                                                <AlertTriangle className="h-3 w-3" />
                                                {row.reason}
                                            </Badge>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {step === 'importing' && (
                        <p className="flex flex-1 items-center justify-center text-center text-sm text-muted-foreground">
                            {t('newFiles.importing', { count: selectedRows.length })}
                        </p>
                    )}

                    {step === 'done' && summary && (
                        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                            <CheckCircle2 className="h-8 w-8 text-muted-foreground" />
                            <p className="text-sm">
                                {t('newFiles.done.imported', { count: summary.imported })}
                            </p>
                            {summary.failed > 0 && (
                                <p className="text-sm text-destructive">
                                    {t('newFiles.done.failed', { count: summary.failed })}
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                {t('newFiles.done.hint')}
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    {step === 'review' && (
                        <Button onClick={handleImport} disabled={selectedRows.length === 0}>
                            {t('newFiles.actions.import', { count: selectedRows.length })}
                        </Button>
                    )}
                    {step === 'done' && <Button onClick={() => onOpenChange(false)}>{t('newFiles.actions.done')}</Button>}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}