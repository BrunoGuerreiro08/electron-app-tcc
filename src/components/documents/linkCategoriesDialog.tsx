import { useEffect, useState } from 'react'
import { useCategoryOptions } from '@/hooks/useCategoryOptions'
import { documentCategoryLinkRepository } from '@/repository/documentCategoryLinkRepository'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'

interface LinkCategoriesDialogProps {
    documentId: string
    open: boolean
    onOpenChange: (open: boolean) => void
    onChanged?: () => void
}

export function LinkCategoriesDialog({
    documentId,
    open,
    onOpenChange,
    onChanged,
}: LinkCategoriesDialogProps) {
    const { options, loading } = useCategoryOptions()
    const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set())

    useEffect(() => {
        if (!open) return
        documentCategoryLinkRepository.listByDocument(documentId).then((cats) => {
            setLinkedIds(new Set(cats.map((c) => c.id)))
        })
    }, [open, documentId])

    const toggle = async (categoryId: string, checked: boolean) => {
        if (checked) {
            await documentCategoryLinkRepository.link(documentId, categoryId)
            setLinkedIds((prev) => new Set(prev).add(categoryId))
        } else {
            await documentCategoryLinkRepository.unlink(documentId, categoryId)
            setLinkedIds((prev) => {
                const next = new Set(prev)
                next.delete(categoryId)
                return next
            })
        }
        onChanged?.()
    }

    const grouped = options.reduce<Record<string, typeof options>>((acc, opt) => {
        acc[opt.collectionName] = acc[opt.collectionName] ?? []
        acc[opt.collectionName].push(opt)
        return acc
    }, {})

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Link to categories</DialogTitle>
                </DialogHeader>
                {loading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                ) : options.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        No categories yet — create a collection and category first.
                    </p>
                ) : (
                    <div className="max-h-80 space-y-4 overflow-y-auto">
                        {Object.entries(grouped).map(([collectionName, cats]) => (
                            <div key={collectionName}>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">{collectionName}</p>
                                <div className="space-y-1">
                                    {cats.map((opt) => (
                                        <label
                                            key={opt.categoryId}
                                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50"
                                        >
                                            <Checkbox
                                                checked={linkedIds.has(opt.categoryId)}
                                                onCheckedChange={(checked) => toggle(opt.categoryId, checked === true)}
                                            />
                                            <span>
                                                {opt.subgroupName} / {opt.categoryName}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    )
}