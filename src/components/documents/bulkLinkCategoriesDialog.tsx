import { useEffect, useState } from 'react'
import { useCategoryOptions } from '@/hooks/useCategoryOptions'
import { documentCategoryLinkRepository } from '@/repository/documentCategoryLinkRepository'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'

interface BulkLinkCategoriesDialogProps {
    selectedIds: string[]
    open: boolean
    onOpenChange: (open: boolean) => void
    onChanged?: () => void
}

export function BulkLinkCategoriesDialog({
    selectedIds,
    open,
    onOpenChange,
    onChanged,
}: BulkLinkCategoriesDialogProps) {
    const { t } = useTranslation('documents')
    const { options, loading } = useCategoryOptions()
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set())
    const [searchQuery, setSearchQuery] = useState('')
    const [actionLoading, setActionLoading] = useState(false)

    useEffect(() => {
        if (!open) {
            setSelectedCategoryIds(new Set())
            setSearchQuery('')
            return
        }
    }, [open])

    const toggleCategory = (categoryId: string, checked: boolean) => {
        const next = new Set(selectedCategoryIds)
        if (checked) next.add(categoryId)
        else next.delete(categoryId)
        setSelectedCategoryIds(next)
    }

    const handleSave = async () => {
        if (selectedCategoryIds.size === 0) return
        setActionLoading(true)
        await Promise.all(
            selectedIds.map(async (docId) => {
                for (const categoryId of selectedCategoryIds) {
                    await documentCategoryLinkRepository.link(docId, categoryId)
                }
            })
        )
        setActionLoading(false)
        onChanged?.()
        onOpenChange(false)
    }

    const filteredOptions = options.filter((opt) => {
        if (!searchQuery.trim()) return true
        const q = searchQuery.toLowerCase()
        return (
            opt.categoryName.toLowerCase().includes(q) ||
            opt.subgroupName.toLowerCase().includes(q) ||
            opt.collectionName.toLowerCase().includes(q)
        )
    })

    const grouped = filteredOptions.reduce<Record<string, typeof options>>((acc, opt) => {
        acc[opt.collectionName] = acc[opt.collectionName] ?? []
        acc[opt.collectionName].push(opt)
        return acc
    }, {})

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{t('bulk.categoriesTitle')}</DialogTitle>
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
                                                checked={selectedCategoryIds.has(opt.categoryId)}
                                                onCheckedChange={(checked) => toggleCategory(opt.categoryId, checked === true)}
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

                <DialogFooter>
                    <Button onClick={handleSave} disabled={selectedCategoryIds.size === 0 || actionLoading}>
                        {t('form.actions.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}