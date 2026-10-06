import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUpDown } from 'lucide-react'
import { subgroupRepository } from '@/repository/subgroupRepository'
import { categoryRepository } from '@/repository/categoryRepository'
import type { SubgroupWithCategories } from '@/hooks/useCollectionDetail'
import { ReorderItemsDialog, type ReorderableItem } from './reorderItemsDialog'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface EditSubgroupDialogProps {
    subgroup: SubgroupWithCategories | null
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}

export function EditSubgroupDialog({ subgroup, onOpenChange, onSaved }: EditSubgroupDialogProps) {
    const { t } = useTranslation(['collections', 'common'])
    const [name, setName] = useState('')
    const [minPoints, setMinPoints] = useState('')
    const [maxPoints, setMaxPoints] = useState('')
    const [error, setError] = useState<string | null>(null)
    // Kept locally (not read straight from `subgroup`) because the parent's
    // refresh after a reorder doesn't hand this dialog a new subgroup object.
    const [categoryOrder, setCategoryOrder] = useState<ReorderableItem[]>([])
    const [reorderOpen, setReorderOpen] = useState(false)

    useEffect(() => {
        if (!subgroup) return
        setName(subgroup.name)
        setCategoryOrder(subgroup.categories.map((cat) => ({ id: cat.id, name: cat.name })))
        setMinPoints(subgroup.min_points != null ? String(subgroup.min_points) : '')
        setMaxPoints(subgroup.max_points != null ? String(subgroup.max_points) : '')
        setError(null)
    }, [subgroup])

    const handleSave = async () => {
        if (!subgroup || !name.trim()) return

        const min = minPoints.trim() ? Number(minPoints) : null
        const max = maxPoints.trim() ? Number(maxPoints) : null

        if (min != null && max != null && max <= min) {
            setError(t('subgroupDialog.errors.maxLessThanMin'))
            return
        }

        try {
            await subgroupRepository.update(subgroup.id, {
                name: name.trim(),
                minPoints: min,
                maxPoints: max,
            })
            onOpenChange(false)
            onSaved()
        } catch (err) {
            setError((err as Error).message)
        }
    }

    const handleReorderSave = async (orderedIds: string[]) => {
        await categoryRepository.reorder(orderedIds)
        setCategoryOrder(orderedIds.map((id) => categoryOrder.find((item) => item.id === id)!))
        onSaved()
    }

    return (
        <>
        <Dialog open={subgroup !== null} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t('subgroupDialog.editTitle')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>{t('common:fields.name')}</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>{t('subgroupDialog.minPointsLabel')}</Label>
                            <Input
                                type="number"
                                step="any"
                                placeholder={t('subgroupDialog.pointsPlaceholder')}
                                value={minPoints}
                                onChange={(e) => setMinPoints(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>{t('subgroupDialog.maxPointsLabel')}</Label>
                            <Input
                                type="number"
                                step="any"
                                placeholder={t('subgroupDialog.pointsPlaceholder')}
                                value={maxPoints}
                                onChange={(e) => setMaxPoints(e.target.value)}
                            />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        {t('subgroupDialog.helperText')}
                    </p>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter className="sm:justify-between">
                    <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => setReorderOpen(true)}
                        disabled={categoryOrder.length < 2}
                    >
                        <ArrowUpDown className="h-4 w-4" />
                        {t('subgroupDialog.reorderButton')}
                    </Button>
                    <Button onClick={handleSave} disabled={!name.trim()}>
                        {t('common:actions.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>

        <ReorderItemsDialog
            open={reorderOpen}
            onOpenChange={setReorderOpen}
            title={t('subgroupDialog.reorderButton')}
            items={categoryOrder}
            onSave={handleReorderSave}
        />
        </>
    )
}