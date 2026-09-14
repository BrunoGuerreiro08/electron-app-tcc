import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { collectionRepository } from '@/repository/collectionRepository'
import { generateConfirmationCode } from '@/lib/generateConfirmationCode'

interface DeleteCollectionDialogProps {
    collectionId: string
    collectionName: string
    open: boolean
    onOpenChange: (open: boolean) => void
    onDeleted: () => void
}

export function DeleteCollectionDialog({
    collectionId,
    collectionName,
    open,
    onOpenChange,
    onDeleted,
}: DeleteCollectionDialogProps) {
    const { t } = useTranslation(['common'])
    const [deleteConfirmCode, setDeleteConfirmCode] = useState('')
    const [deleteInputCode, setDeleteInputCode] = useState('')

    // Generate a fresh code every time the dialog opens
    useEffect(() => {
        if (open) {
            setDeleteConfirmCode(generateConfirmationCode())
            setDeleteInputCode('')
        }
    }, [open])

    const handleDelete = async () => {
        if (deleteInputCode !== deleteConfirmCode) return
        await collectionRepository.delete(collectionId)
        onDeleted()
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('common:actions.delete')} {collectionName}</DialogTitle>
                    <div className="text-sm text-muted-foreground pt-2 space-y-4">
                        <p>This action cannot be undone. To confirm deletion, type the exact code below:</p>
                        <div className="rounded bg-muted py-2 text-center font-mono text-lg font-bold tracking-widest text-foreground select-none">
                            {deleteConfirmCode}
                        </div>
                    </div>
                </DialogHeader>
                <Input
                    value={deleteInputCode}
                    onChange={(e) => setDeleteInputCode(e.target.value)}
                    placeholder="Type confirmation code"
                    className="font-mono mt-2"
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && deleteInputCode === deleteConfirmCode && handleDelete()}
                />
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        {t('common:actions.cancel')}
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleDelete}
                        disabled={deleteInputCode !== deleteConfirmCode}
                    >
                        {t('common:actions.delete')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}