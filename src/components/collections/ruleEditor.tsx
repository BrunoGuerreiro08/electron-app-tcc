import { useEffect, useState } from 'react'
import type { Rule } from '@/services/scoringEngine/types'
import { validateRule } from '@/services/scoringEngine/validateRule'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'

interface RuleEditorProps {
    value: Rule
    onChange: (rule: Rule) => void
}

const RULE_TYPE_LABELS: Record<Rule['type'], string> = {
    flat: 'Flat — N points per document',
    hours: 'Hours — points per N hours declared',
    capped: 'Capped — either type, with a maximum',
}

function defaultRuleFor(type: Rule['type']): Rule {
    if (type === 'flat') return { type: 'flat', pointsPerUnit: 1 }
    if (type === 'hours') return { type: 'hours', pointsPerUnit: 1, unitSize: 1 }
    return { type: 'capped', inner: { type: 'flat', pointsPerUnit: 1 }, cap: 10 }
}

export function RuleEditor({ value, onChange }: RuleEditorProps) {
    const [errors, setErrors] = useState<string[]>([])

    useEffect(() => {
        setErrors(validateRule(value).errors)
    }, [value])

    const handleTypeChange = (type: Rule['type']) => {
        // NFR-04-05: switching rule type clears params that no longer apply
        onChange(defaultRuleFor(type))
    }

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>Rule type</Label>
                <Select value={value.type} onValueChange={(v) => handleTypeChange(v as Rule['type'])}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {(Object.keys(RULE_TYPE_LABELS) as Rule['type'][]).map((t) => (
                            <SelectItem key={t} value={t}>
                                {RULE_TYPE_LABELS[t]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {value.type === 'flat' && (
                <div className="space-y-2">
                    <Label>Points per document</Label>
                    <Input
                        type="number"
                        min={0}
                        step="any"
                        value={value.pointsPerUnit}
                        onChange={(e) =>
                            onChange({ type: 'flat', pointsPerUnit: Number(e.target.value) })
                        }
                    />
                </div>
            )}

            {value.type === 'hours' && (
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <Label>Points awarded</Label>
                        <Input
                            type="number"
                            min={0}
                            step="any"
                            value={value.pointsPerUnit}
                            onChange={(e) =>
                                onChange({ ...value, pointsPerUnit: Number(e.target.value) })
                            }
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Per N hours</Label>
                        <Input
                            type="number"
                            min={0}
                            step="any"
                            value={value.unitSize}
                            onChange={(e) => onChange({ ...value, unitSize: Number(e.target.value) })}
                        />
                    </div>
                </div>
            )}

            {value.type === 'capped' && (
                <div className="space-y-4 rounded-md border p-3">
                    <div className="space-y-2">
                        <Label>Inner rule type</Label>
                        <Select
                            value={value.inner.type}
                            onValueChange={(v) =>
                                onChange({
                                    ...value,
                                    inner:
                                        v === 'flat'
                                            ? { type: 'flat', pointsPerUnit: 1 }
                                            : { type: 'hours', pointsPerUnit: 1, unitSize: 1 },
                                })
                            }
                        >
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="flat">Flat</SelectItem>
                                <SelectItem value="hours">Hours</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {value.inner.type === 'flat' && (
                        <div className="space-y-2">
                            <Label>Points per document</Label>
                            <Input
                                type="number"
                                min={0}
                                step="any"
                                value={value.inner.pointsPerUnit}
                                onChange={(e) =>
                                    onChange({
                                        ...value,
                                        inner: { type: 'flat', pointsPerUnit: Number(e.target.value) },
                                    })
                                }
                            />
                        </div>
                    )}

                    {value.inner.type === 'hours' && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>Points awarded</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={value.inner.pointsPerUnit}
                                    onChange={(e) =>
                                        onChange({
                                            ...value,
                                            inner: { ...value.inner, pointsPerUnit: Number(e.target.value) } as any,
                                        })
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Per N hours</Label>
                                <Input
                                    type="number"
                                    min={0}
                                    step="any"
                                    value={(value.inner as any).unitSize}
                                    onChange={(e) =>
                                        onChange({
                                            ...value,
                                            inner: { ...value.inner, unitSize: Number(e.target.value) } as any,
                                        })
                                    }
                                />
                            </div>
                        </div>
                    )}

                    <div className="space-y-2">
                        <Label>Maximum total points</Label>
                        <Input
                            type="number"
                            min={0}
                            step="any"
                            value={value.cap}
                            onChange={(e) => onChange({ ...value, cap: Number(e.target.value) })}
                        />
                    </div>
                </div>
            )}

            {errors.length > 0 && (
                <ul className="space-y-1 text-xs text-destructive">
                    {errors.map((err) => (
                        <li key={err}>{err}</li>
                    ))}
                </ul>
            )}
        </div>
    )
}