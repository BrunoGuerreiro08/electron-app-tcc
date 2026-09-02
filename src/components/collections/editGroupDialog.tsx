import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { groupRepository } from '@/repository/groupRepository'
import type { Group } from '@/types/entities'

interface Props {
    group: Group | null
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}

// NOTE: hardcoded strings throughout — same i18n caveat flagged elsewhere
// this session (no visibility into the locale JSON files). Suggest a
// collections:groupEditDialog.* namespace mirroring whatever
// subgroupCreateDialog/subgroupCard already use.

export function EditGroupDialog({ group, onOpenChange, onSaved }: Props) {
    const [name, setName] = useState('')
    const [minPoints, setMinPoints] = useState('')
    const [maxPoints, setMaxPoints] = useState('')
    // Stored as a 0-1 fraction (bonus_rate), edited here as a 0-100
    // percentage — friendlier to type than "0.25".
    const [bonusPercent, setBonusPercent] = useState('')
    const [error, setError] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)

    useEffect(() => {
        if (group) {
            setName(group.name)
            setMinPoints(group.min_points != null ? String(group.min_points) : '')
            setMaxPoints(group.max_points != null ? String(group.max_points) : '')
            setBonusPercent(group.bonus_rate != null ? String(group.bonus_rate * 100) : '')
            setError(null)
        }
    }, [group])

    const handleSave = async () => {
        if (!group || !name.trim()) return
        setError(null)
        setSaving(true)
        try {
            await groupRepository.update(group.id, {
                name: name.trim(),
                minPoints: minPoints.trim() === '' ? null : Number(minPoints),
                maxPoints: maxPoints.trim() === '' ? null : Number(maxPoints),
                bonusRate: bonusPercent.trim() === '' ? null : Number(bonusPercent) / 100,
            })
            onSaved()
            onOpenChange(false)
        } catch (err) {
            // updateGroup throws plain Error messages (see groups.ts) —
            // e.g. "max_points must be greater than min_points" — shown
            // inline rather than as an unhandled rejection.
            setError((err as Error).message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={group !== null} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit group</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label>Name</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>Minimum points</Label>
                            <Input
                                type="number"
                                value={minPoints}
                                onChange={(e) => setMinPoints(e.target.value)}
                                placeholder="None"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label>Maximum points</Label>
                            <Input
                                type="number"
                                value={maxPoints}
                                onChange={(e) => setMaxPoints(e.target.value)}
                                placeholder="None"
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label>Surplus bonus (% of points above minimum)</Label>
                        <Input
                            type="number"
                            value={bonusPercent}
                            onChange={(e) => setBonusPercent(e.target.value)}
                            placeholder="None"
                        />
                        <p className="text-xs text-muted-foreground">
                            Requires a minimum to be set — the bonus applies only to points earned above it.
                        </p>
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button onClick={handleSave} disabled={!name.trim() || saving}>
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}