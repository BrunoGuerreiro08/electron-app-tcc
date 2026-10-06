import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDownAZ, ArrowDownZA, GripVertical, RotateCcw } from 'lucide-react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface ReorderableItem {
    id: string
    name: string
}

interface Props {
    open: boolean
    onOpenChange: (open: boolean) => void
    title: string
    items: ReorderableItem[]
    onSave: (orderedIds: string[]) => Promise<void>
}

function moveItem<T>(list: T[], from: number, to: number): T[] {
    const next = list.slice()
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    return next
}

export function ReorderItemsDialog({ open, onOpenChange, title, items, onSave }: Props) {
    const { t } = useTranslation(['collections', 'common'])
    const [order, setOrder] = useState<ReorderableItem[]>([])
    // Per-row draft of the typed position, keyed by item id — only
    // committed on blur/Enter so typing "12" doesn't jump at "1".
    const [positionDrafts, setPositionDrafts] = useState<Record<string, string>>({})
    const [dragIndex, setDragIndex] = useState<number | null>(null)
    // Index the dragged item would land at (0..n), drawn as a line above that row.
    const [dropIndex, setDropIndex] = useState<number | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    // Reset to the persisted order every time the dialog opens, so
    // Cancel simply discards whatever was changed locally.
    useEffect(() => {
        if (open) {
            setOrder(items)
            setPositionDrafts({})
            setError(null)
        }
    }, [open, items])

    const isDirty = order.some((item, i) => item.id !== items[i]?.id)

    const clearDraft = (id: string) => {
        setPositionDrafts((prev) => {
            const next = { ...prev }
            delete next[id]
            return next
        })
    }

    const applyOrder = (next: ReorderableItem[]) => {
        setOrder(next)
        setPositionDrafts({})
    }

    const sortByName = (direction: 1 | -1) => {
        applyOrder(
            order
                .slice()
                .sort((a, b) => direction * a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
        )
    }

    const commitPosition = (id: string) => {
        const draft = positionDrafts[id]
        if (draft === undefined) return
        const from = order.findIndex((item) => item.id === id)
        const typed = Number.parseInt(draft, 10)
        if (Number.isNaN(typed)) {
            clearDraft(id)
            return
        }
        const to = Math.min(Math.max(typed, 1), order.length) - 1
        applyOrder(from === to ? order : moveItem(order, from, to))
    }

    const handleDrop = () => {
        if (dragIndex !== null && dropIndex !== null) {
            // Removing the dragged item first shifts every later index down by one.
            const to = dropIndex > dragIndex ? dropIndex - 1 : dropIndex
            if (to !== dragIndex) applyOrder(moveItem(order, dragIndex, to))
        }
        setDragIndex(null)
        setDropIndex(null)
    }

    const handleSave = async () => {
        setError(null)
        setSaving(true)
        try {
            await onSave(order.map((item) => item.id))
            onOpenChange(false)
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                    <DialogDescription>{t('reorderDialog.description')}</DialogDescription>
                </DialogHeader>

                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => sortByName(1)}>
                        <ArrowDownAZ className="h-4 w-4" />
                        {t('reorderDialog.sortAsc')}
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => sortByName(-1)}>
                        <ArrowDownZA className="h-4 w-4" />
                        {t('reorderDialog.sortDesc')}
                    </Button>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2"
                        onClick={() => applyOrder(items)}
                        disabled={!isDirty}
                    >
                        <RotateCcw className="h-4 w-4" />
                        {t('reorderDialog.reset')}
                    </Button>
                </div>

                <ol
                    className="max-h-[60vh] overflow-y-auto rounded-md border"
                    onDragOver={(e) => {
                        // Hovering below the last row targets the end of the list.
                        if (dragIndex === null || e.target !== e.currentTarget) return
                        e.preventDefault()
                        setDropIndex(order.length)
                    }}
                    onDrop={(e) => {
                        e.preventDefault()
                        handleDrop()
                    }}
                >
                    {order.map((item, index) => (
                        <li
                            key={item.id}
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.effectAllowed = 'move'
                                setDragIndex(index)
                            }}
                            onDragOver={(e) => {
                                if (dragIndex === null) return
                                e.preventDefault()
                                const rect = e.currentTarget.getBoundingClientRect()
                                const before = e.clientY < rect.top + rect.height / 2
                                setDropIndex(before ? index : index + 1)
                            }}
                            onDragEnd={() => {
                                setDragIndex(null)
                                setDropIndex(null)
                            }}
                            className={cn(
                                'flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0 bg-background',
                                dragIndex === index && 'opacity-40',
                                dropIndex === index && 'shadow-[inset_0_2px_0_0_var(--primary)]',
                                dropIndex === order.length && index === order.length - 1 &&
                                    'shadow-[inset_0_-2px_0_0_var(--primary)]'
                            )}
                        >
                            <GripVertical
                                className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground"
                                aria-label={t('reorderDialog.dragHandle')}
                            />
                            <Input
                                type="number"
                                min={1}
                                max={order.length}
                                aria-label={t('reorderDialog.positionLabel')}
                                className="h-8 w-16 shrink-0"
                                value={positionDrafts[item.id] ?? String(index + 1)}
                                onChange={(e) =>
                                    setPositionDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                                }
                                onBlur={() => commitPosition(item.id)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault()
                                        commitPosition(item.id)
                                    } else if (e.key === 'Escape') {
                                        // Revert just this field instead of closing the dialog.
                                        e.stopPropagation()
                                        clearDraft(item.id)
                                    }
                                }}
                                // Dragging selected text in the input shouldn't start a row drag.
                                onDragStart={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                }}
                            />
                            <span className="min-w-0 flex-1 truncate">{item.name}</span>
                        </li>
                    ))}
                </ol>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                        {t('common:actions.cancel')}
                    </Button>
                    <Button onClick={handleSave} disabled={!isDirty || saving}>
                        {saving ? t('common:states.saving') : t('common:actions.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
