import { useEffect, useState } from 'react'
import { categoryRepository } from '@/repository/categoryRepository'
import type { Category } from '@/types/entities'
import type { Rule } from '@/services/scoringEngine/types'
import { validateRule } from '@/services/scoringEngine/validateRule'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { RuleEditor } from './ruleEditor'

interface EditCategoryDialogProps {
    category: Category | null
    onOpenChange: (open: boolean) => void
    onSaved: () => void
}

export function EditCategoryDialog({ category, onOpenChange, onSaved }: EditCategoryDialogProps) {
    const [name, setName] = useState('')
    const [rule, setRule] = useState<Rule>({ type: 'flat', pointsPerUnit: 1 })
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!category) return
        setName(category.name)
        setRule(category.rule)
        setError(null)
    }, [category])

    const handleSave = async () => {
        if (!category || !name.trim()) return

        const { valid, errors } = validateRule(rule)
        if (!valid) {
            setError(errors.join(' '))
            return
        }

        try {
            await categoryRepository.update(category.id, { name: name.trim(), rule })
            onOpenChange(false)
            onSaved()
        } catch (err) {
            setError((err as Error).message)
        }
    }

    return (
        <Dialog open={category !== null} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Edit category</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label>Name</Label>
                        <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
                    </div>
                    <RuleEditor value={rule} onChange={setRule} />
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