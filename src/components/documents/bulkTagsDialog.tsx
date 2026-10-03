import { useEffect, useState } from 'react'
import { tagRepository } from '@/repository/tagRepository'
import type { Tag } from '@/types/entities'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface BulkTagsDialogProps {
    selectedIds: string[]
    open: boolean
    onOpenChange: (open: boolean) => void
    onChanged?: () => void
}

export function BulkTagsDialog({ selectedIds, open, onOpenChange, onChanged }: BulkTagsDialogProps) {
    const { t } = useTranslation('documents')
    const [allTags, setAllTags] = useState<Tag[]>([])
    const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set())
    const [newTagName, setNewTagName] = useState('')
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (!open) {
            setSelectedTagIds(new Set())
            setNewTagName('')
            return
        }
        tagRepository.list().then(setAllTags)
    }, [open])

    const toggleTag = (tagId: string, checked: boolean) => {
        const next = new Set(selectedTagIds)
        if (checked) next.add(tagId)
        else next.delete(tagId)
        setSelectedTagIds(next)
    }

    const createAndSelectTag = async () => {
        if (!newTagName.trim()) return
        const id = await tagRepository.create(newTagName.trim())
        const updatedTags = await tagRepository.list()
        setAllTags(updatedTags)
        setSelectedTagIds((prev) => new Set(prev).add(id))
        setNewTagName('')
    }

    const handleSave = async () => {
        if (selectedTagIds.size === 0) return
        setLoading(true)
        await Promise.all(
            selectedIds.map(async (docId) => {
                for (const tagId of selectedTagIds) {
                    await tagRepository.attachToDocument(docId, tagId)
                }
            })
        )
        setLoading(false)
        onChanged?.()
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('bulk.tagsTitle')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="max-h-60 space-y-1 overflow-y-auto pr-1">
                        {allTags.map((tag) => (
                            <label
                                key={tag.id}
                                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 cursor-pointer"
                            >
                                <Checkbox
                                    checked={selectedTagIds.has(tag.id)}
                                    onCheckedChange={(checked) => toggleTag(tag.id, checked === true)}
                                />
                                <span>{tag.name}</span>
                            </label>
                        ))}
                        {allTags.length === 0 && (
                            <p className="text-sm text-muted-foreground text-center py-4">No tags available.</p>
                        )}
                    </div>

                    <div className="flex gap-1 border-t pt-3">
                        <Input
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            placeholder={t('tags.placeholder')}
                            className="h-8 text-xs flex-1"
                            onKeyDown={(e) => e.key === 'Enter' && createAndSelectTag()}
                        />
                        <Button size="icon" className="h-8 w-8 shrink-0" onClick={createAndSelectTag}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={selectedTagIds.size === 0 || loading}>
                        {t('form.actions.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}