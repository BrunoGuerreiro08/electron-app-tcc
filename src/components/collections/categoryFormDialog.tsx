import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { categoryRepository } from '@/repository/categoryRepository'
import type { Category } from '@/types/entities'
import type { Rule } from '@/services/scoringEngine/types'
import { validateRule } from '@/services/scoringEngine/validateRule'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RuleEditor } from './ruleEditor'
import { translateRuleErrors } from '@/lib/translateRuleErrors'

const DEFAULT_RULE: Rule = { type: 'flat', pointsPerUnit: 1 }

interface CategoryFormDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onSaved: () => void
    /** Required when creating (no `category` provided) */
    subgroupId?: string
    /** Present = edit mode; absent = create mode */
    category?: Category | null
}

export function CategoryFormDialog({
    open,
    onOpenChange,
    onSaved,
    subgroupId,
    category,
}: CategoryFormDialogProps) {
    const { t } = useTranslation(['categories', 'common'])
    const isEdit = !!category
    const [name, setName] = useState('')
    const [rule, setRule] = useState<Rule>(DEFAULT_RULE)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!open) return
        setName(category?.name ?? '')
        setRule(category?.rule ?? DEFAULT_RULE)
        setError(null)
    }, [open, category])

    const handleSave = async () => {
        if (!name.trim()) return

        const { valid, errors } = validateRule(rule)
        if (!valid) {
            setError(translateRuleErrors(errors, t).join(' '))
            return
        }

        try {
            if (isEdit && category) {
                await categoryRepository.update(category.id, { name: name.trim(), rule })
            } else if (subgroupId) {
                await categoryRepository.create(subgroupId, name.trim(), rule)
            }
            onOpenChange(false)
            onSaved()
        } catch (err) {
            setError((err as Error).message)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{isEdit ? t('dialog.editTitle') : t('dialog.createTitle')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>{t('common:fields.name')}</Label>
                        <Input
                            placeholder={t('dialog.namePlaceholder')}
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                        />
                    </div>
                    <RuleEditor value={rule} onChange={setRule} />
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                    <Button onClick={handleSave} disabled={!name.trim()}>
                        {isEdit ? t('common:actions.save') : t('common:actions.create')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}