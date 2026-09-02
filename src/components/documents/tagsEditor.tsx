import { useEffect, useState } from 'react'
import { tagRepository } from '@/repository/tagRepository'
import type { Tag } from '@/types/entities'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tag as TagIcon, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface TagsEditorProps {
    documentId: string
    onChanged?: () => void
}

export function TagsEditor({ documentId, onChanged }: TagsEditorProps) {
    const { t } = useTranslation('documents')
    const [allTags, setAllTags] = useState<Tag[]>([])
    const [documentTags, setDocumentTags] = useState<Tag[]>([])
    const [newTagName, setNewTagName] = useState('')
    const [open, setOpen] = useState(false)

    const load = async () => {
        const [all, mine] = await Promise.all([
            tagRepository.list(),
            tagRepository.listForDocument(documentId),
        ])
        setAllTags(all)
        setDocumentTags(mine)
    }

    useEffect(() => {
        if (open) load()
    }, [open])

    const toggleTag = async (tag: Tag) => {
        const isAttached = documentTags.some((t) => t.id === tag.id)
        if (isAttached) {
            await tagRepository.detachFromDocument(documentId, tag.id)
        } else {
            await tagRepository.attachToDocument(documentId, tag.id)
        }
        await load()
        onChanged?.()
    }

    const createTag = async () => {
        if (!newTagName.trim()) return
        const id = await tagRepository.create(newTagName.trim())
        await tagRepository.attachToDocument(documentId, id)
        setNewTagName('')
        await load()
        onChanged?.()
    }

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-xs text-muted-foreground">
                    <TagIcon className="h-3 w-3" />
                    {t('tags.button')}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 space-y-3">
                <div className="flex flex-wrap gap-1">
                    {documentTags.length === 0 && (
                        <p className="text-xs text-muted-foreground">{t('tags.empty')}</p>
                    )}
                    {documentTags.map((t) => (
                        <Badge key={t.id} variant="secondary" className="gap-1">
                            {t.name}
                            <button onClick={() => toggleTag(t)}>
                                <X className="h-3 w-3" />
                            </button>
                        </Badge>
                    ))}
                </div>

                <div className="space-y-1">
                    {allTags
                        .filter((t) => !documentTags.some((dt) => dt.id === t.id))
                        .map((t) => (
                            <button
                                key={t.id}
                                onClick={() => toggleTag(t)}
                                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-muted"
                            >
                                {t.name}
                            </button>
                        ))}
                </div>

                <div className="flex gap-1 border-t pt-2">
                    <Input
                        value={newTagName}
                        onChange={(e) => setNewTagName(e.target.value)}
                        placeholder={t('tags.placeholder')}
                        className="h-7 text-xs"
                        onKeyDown={(e) => e.key === 'Enter' && createTag()}
                    />
                    <Button size="icon" className="h-7 w-7 shrink-0" onClick={createTag}>
                        <Plus className="h-3 w-3" />
                    </Button>
                </div>
            </PopoverContent>
        </Popover>
    )
}