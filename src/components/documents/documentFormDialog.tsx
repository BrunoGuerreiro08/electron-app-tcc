import { useEffect, useState } from 'react'
import { documentRepository } from '@/repository/documentRepository'
import type { Document } from '@/types/entities'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'

interface DocumentFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSaved: () => void
    /** Present = edit mode; absent = create mode */
    document?: Document | null
}

export function DocumentFormDialog({
    open,
    onOpenChange,
    onSaved,
    document,
}: DocumentFormDialogProps) {
    const { t } = useTranslation('documents')
    const isEdit = !!document
    const [title, setTitle] = useState('')
    const [issuer, setIssuer] = useState('')
    const [issuedAt, setIssuedAt] = useState('')
    const [quantity, setQuantity] = useState('1')
    const [hours, setHours] = useState('')
    const [notes, setNotes] = useState('')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return
        setTitle(document?.title ?? '')
        setIssuer(document?.issuer ?? '')
        setIssuedAt(document?.issued_at ?? '')
        setQuantity(document ? String(document.quantity) : '1')
        setHours(document?.hours != null ? String(document.hours) : '')
        setNotes(document?.notes ?? '')
        setError(null)
    }, [open, document])

    const handleSave = async () => {
        if (!title.trim()) return

        const input = {
            title: title.trim(),
            issuer: issuer.trim() || undefined,
            issuedAt: issuedAt || undefined,
            quantity: quantity ? Number(quantity) : 1,
            hours: hours ? Number(hours) : undefined,
            notes: notes.trim() || undefined,
        }

        try {
            if (isEdit && document) {
                await documentRepository.update(document.id, input)
            } else {
                await documentRepository.create(input)
            }
            onOpenChange(false)
            onSaved()
        } catch (err) {
            setError((err as Error).message)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isEdit ? t('form.editTitle') : t('form.newTitle')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="space-y-2">
                        <Label>{t('form.fields.title')}</Label>
                        <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>{t('form.fields.issuer')}</Label>
                            <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>{t('form.fields.dateIssued')}</Label>
                            <Input type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>{t('form.fields.quantity')}</Label>
                            <Input
                                type="number"
                                min={1}
                                step="any"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value)}
                            />
                            <p className="text-xs text-muted-foreground">
                                {t('form.fields.quantityHint')}
                            </p>
                        </div>
                        <div className="space-y-2">
                            <Label>{t('form.fields.hours')}</Label>
                            <Input
                                type="number"
                                min={0}
                                step="any"
                                value={hours}
                                onChange={(e) => setHours(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="space-y-2">
                        <Label>{t('form.fields.notes')}</Label>
                        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </div>
                    {!isEdit && (
                        <p className="text-xs text-muted-foreground">
                            {t('form.attachHint')}
                        </p>
                    )}
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={!title.trim()}>
                        {isEdit ? t('form.actions.save') : t('form.actions.create')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}