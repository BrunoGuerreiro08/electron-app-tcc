import { useEffect, useState } from 'react'
import { tagRepository } from '@/repository/tagRepository'
import type { Tag } from '@/types/entities'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog'
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Pencil, Trash2, Check, X as XIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ManageTagsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onChanged: () => void
}

export function ManageTagsDialog({ open, onOpenChange, onChanged }: ManageTagsDialogProps) {
    const { t } = useTranslation('documents')
    const [tags, setTags] = useState<Tag[]>([])
    const [loading, setLoading] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [tagToDelete, setTagToDelete] = useState<Tag | null>(null)
    const [editColor, setEditColor] = useState('#000000')

    const loadTags = async () => {
        setLoading(true)
        try {
            const fetchedTags = await tagRepository.list()
            setTags(fetchedTags.sort((a, b) => a.name.localeCompare(b.name)))
        } catch (error) {
            console.error("Failed to load tags", error)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        if (open) {
            loadTags()
            setEditingId(null)
            setTagToDelete(null)
        }
    }, [open])

    const confirmDelete = async () => {
        if (!tagToDelete) return

        await tagRepository.delete(tagToDelete.id)
        setTagToDelete(null)
        await loadTags()
        onChanged()
    }

    const startEditing = (tag: Tag) => {
        setEditingId(tag.id)
        setEditName(tag.name)
        setEditColor(tag.color || '#000000')
    }

    const handleSaveEdit = async (id: string) => {
        if (!editName.trim()) return
        await tagRepository.update(id, editName.trim(), editColor)
        setEditingId(null)
        await loadTags()
        onChanged()
    }

    const cancelEditing = () => {
        setEditingId(null)
        setEditName('')
    }

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>{t('tags.manageTitle')}</DialogTitle>
                        <DialogDescription>
                            {t('tags.manageDescription')}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto pr-2 mt-4 space-y-2">
                        {loading ? (
                            <p className="text-sm text-muted-foreground">{t('library.loading')}</p>
                        ) : tags.length === 0 ? (
                            <p className="text-sm text-muted-foreground">{t('tags.empty')}</p>
                        ) : (
                            tags.map((tag) => (
                                <div key={tag.id} className="flex items-center justify-between p-2 border rounded-md group hover:bg-muted/50 transition-colors">
                                    {editingId === tag.id ? (
                                        <div className="flex items-center gap-2 flex-1 mr-2">
                                            <input
                                                type="color"
                                                value={editColor}
                                                onChange={(e) => setEditColor(e.target.value)}
                                                className="h-8 w-8 rounded cursor-pointer border-0 p-0"
                                            />
                                            <Input
                                                value={editName}
                                                onChange={(e) => setEditName(e.target.value)}
                                                className="h-8 text-sm"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleSaveEdit(tag.id)
                                                    if (e.key === 'Escape') cancelEditing()
                                                }}
                                            />
                                            <Button size="icon" variant="ghost" className="h-8 w-8 text-green-600" onClick={() => handleSaveEdit(tag.id)}>
                                                <Check className="h-4 w-4" />
                                            </Button>
                                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={cancelEditing}>
                                                <XIcon className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="text-sm font-medium truncate pr-4">{tag.name}</span>
                                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => startEditing(tag)}>
                                                    <Pencil className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive/90 hover:bg-destructive/10" onClick={() => setTagToDelete(tag)}>
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            <AlertDialog open={!!tagToDelete} onOpenChange={(isOpen) => !isOpen && setTagToDelete(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t('tags.deleteConfirmTitle')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('tags.deleteConfirm')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('actions.cancel')}</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDelete}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {t('actions.delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    )
}