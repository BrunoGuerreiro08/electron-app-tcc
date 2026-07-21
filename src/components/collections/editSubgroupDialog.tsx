import { useEffect, useState } from 'react'
import { subgroupRepository } from '@/repository/subgroupRepository'
import type { Subgroup } from '@/types/entities'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface EditSubgroupDialogProps {
    subgroup: Subgroup | null
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}

export function EditSubgroupDialog({ subgroup, onOpenChange, onSaved }: EditSubgroupDialogProps) {
    const [name, setName] = useState('')
    const [minPoints, setMinPoints] = useState('')
    const [maxPoints, setMaxPoints] = useState('')
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!subgroup) return
        setName(subgroup.name)
        setMinPoints(subgroup.min_points != null ? String(subgroup.min_points) : '')
        setMaxPoints(subgroup.max_points != null ? String(subgroup.max_points) : '')
        setError(null)
    }, [subgroup])

    const handleSave = async () => {
        if (!subgroup || !name.trim()) return

        const min = minPoints.trim() ? Number(minPoints) : null
        const max = maxPoints.trim() ? Number(maxPoints) : null

        if (min != null && max != null && max <= min) {
            setError('Maximum must be greater than minimum.')
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

    return (
        <Dialog open={subgroup !== null} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit sub-group</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label>Minimum points</Label>
                            <Input
                                type="number"
                                step="any"
                                placeholder="None"
                                value={minPoints}
                                onChange={(e) => setMinPoints(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Maximum points</Label>
                            <Input
                                type="number"
                                step="any"
                                placeholder="None"
                                value={maxPoints}
                                onChange={(e) => setMaxPoints(e.target.value)}
                            />
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Leave both blank for no completion tracking on this sub-group.
                    </p>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={!name.trim()}>
                        Save
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}