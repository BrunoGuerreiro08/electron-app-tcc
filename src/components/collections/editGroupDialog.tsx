import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

export function EditGroupDialog({ group, onOpenChange, onSaved }: Props) {
    const { t } = useTranslation(['collections', 'common'])
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
                    <DialogTitle>{t('groupDialog.editTitle')}</DialogTitle>
                </DialogHeader>

                <div className="space-y-3">
                    <div className="space-y-1">
                        <Label>{t('common:fields.name')}</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                            <Label>{t('groupDialog.minPointsLabel')}</Label>
                            <Input
                                type="number"
                                value={minPoints}
                                onChange={(e) => setMinPoints(e.target.value)}
                                placeholder={t('groupDialog.pointsPlaceholder')}
                            />
                        </div>
                        <div className="space-y-1">
                            <Label>{t('groupDialog.maxPointsLabel')}</Label>
                            <Input
                                type="number"
                                value={maxPoints}
                                onChange={(e) => setMaxPoints(e.target.value)}
                                placeholder={t('groupDialog.pointsPlaceholder')}
                            />
                        </div>
                    </div>

                    <div className="space-y-1">
                        <Label>{t('groupDialog.bonusLabel')}</Label>
                        <Input
                            type="number"
                            value={bonusPercent}
                            onChange={(e) => setBonusPercent(e.target.value)}
                            placeholder={t('groupDialog.pointsPlaceholder')}
                        />
                        <p className="text-xs text-muted-foreground">
                            {t('groupDialog.bonusHelperText')}
                        </p>
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>

                <DialogFooter>
                    <Button onClick={handleSave} disabled={!name.trim() || saving}>
                        {saving ? t('common:states.saving') : t('common:actions.save')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}