import { useEffect, useState } from 'react'
import { useCategoryOptions } from '@/hooks/useCategoryOptions'
import { documentCategoryLinkRepository } from '@/repository/documentCategoryLinkRepository'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'

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
    const { t } = useTranslation('documents')
    const { options, loading } = useCategoryOptions()
    const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        if (!open) {
            setSearchQuery('') // Reset search when closing
            return
        }
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

    // Filter options based on the search input
    const filteredOptions = options.filter((opt) => {
        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase()
        return (
            opt.categoryName.toLowerCase().includes(q) ||
            opt.subgroupName.toLowerCase().includes(q) ||
            opt.collectionName.toLowerCase().includes(q)
        )
    })

    // Group the filtered options
    const grouped = filteredOptions.reduce<Record<string, typeof options>>((acc, opt) => {
        acc[opt.collectionName] = acc[opt.collectionName] ?? []
        acc[opt.collectionName].push(opt)
        return acc
    }, {})

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            {/* Added sm:max-w-2xl for wider modal */}
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('linkCategories.title')}</DialogTitle>
                </DialogHeader>

                <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="search"
                        placeholder={t('linkCategories.searchPlaceholder')}
                        className="pl-9"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        disabled={loading || options.length === 0}
                    />
                </div>

                {loading ? (
                    <p className="text-sm text-muted-foreground">{t('linkCategories.loading')}</p>
                ) : options.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {t('linkCategories.empty')}
                    </p>
                ) : filteredOptions.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                        {t('linkCategories.noResults')}
                    </p>
                ) : (
                    <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-2">
                        {Object.entries(grouped).map(([collectionName, cats]) => (
                            <div key={collectionName}>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">{collectionName}</p>
                                <div className="space-y-1">
                                    {cats.map((opt) => (
                                        <label
                                            key={opt.categoryId}
                                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 cursor-pointer"
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
        </Dialog >
    )
}