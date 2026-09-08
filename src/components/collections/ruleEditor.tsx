import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { FlatRule, HoursRule, Rule } from '@/services/scoringEngine/types'
import { validateRule } from '@/services/scoringEngine/validateRule'
import { translateRuleErrors } from '@/lib/translateRuleErrors'
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

function defaultRuleFor(type: Rule['type']): Rule {
    if (type === 'flat') return { type: 'flat', pointsPerUnit: 1 }
    if (type === 'hours') return { type: 'hours', pointsPerUnit: 1, unitSize: 1 }
    if (type === 'capped') return { type: 'capped', inner: { type: 'flat', pointsPerUnit: 1 }, cap: 10 }
    return { type: 'cappedPerDocument', inner: { type: 'flat', pointsPerUnit: 1 }, capPerDocument: 5 }
}

interface InnerRuleEditorProps {
    inner: FlatRule | HoursRule
    onChange: (inner: FlatRule | HoursRule) => void
}

/**
 * Shared by both `capped` and `cappedPerDocument` below — they wrap the
 * exact same FlatRule | HoursRule shape, so this is the one place that
 * edits it. Taking `inner` as a plain typed parameter (rather than
 * reaching through `value.inner` inside each closure, as the original
 * `capped`-only version did) lets TypeScript narrow `inner.type ===
 * 'hours'` correctly on its own — no `as any` casts needed.
 */
function InnerRuleEditor({ inner, onChange }: InnerRuleEditorProps) {
    const { t } = useTranslation('categories')

    return (
        <>
            <div className="space-y-2">
                <Label>{t('rule.innerRuleTypeLabel')}</Label>
                <Select
                    value={inner.type}
                    onValueChange={(v) =>
                        onChange(
                            v === 'flat'
                                ? { type: 'flat', pointsPerUnit: 1 }
                                : { type: 'hours', pointsPerUnit: 1, unitSize: 1 }
                        )
                    }
                >
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="flat">{t('rule.innerType.flat')}</SelectItem>
                        <SelectItem value="hours">{t('rule.innerType.hours')}</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {inner.type === 'flat' && (
                <div className="space-y-2">
                    <Label>{t('rule.pointsPerDocument')}</Label>
                    <Input
                        type="number"
                        min={0}
                        step="any"
                        value={inner.pointsPerUnit}
                        onChange={(e) => onChange({ type: 'flat', pointsPerUnit: Number(e.target.value) })}
                    />
                </div>
            )}

            {inner.type === 'hours' && (
                <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <Label>{t('rule.pointsAwarded')}</Label>
                        <Input
                            type="number"
                            min={0}
                            step="any"
                            value={inner.pointsPerUnit}
                            onChange={(e) => onChange({ ...inner, pointsPerUnit: Number(e.target.value) })}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>{t('rule.perNHours')}</Label>
                        <Input
                            type="number"
                            min={0}
                            step="any"
                            value={inner.unitSize}
                            onChange={(e) => onChange({ ...inner, unitSize: Number(e.target.value) })}
                        />
                    </div>
                </div>
            )}
        </>
    )
}

export function RuleEditor({ value, onChange }: RuleEditorProps) {
    const { t } = useTranslation('categories')
    const [errors, setErrors] = useState<string[]>([])

    useEffect(() => {
        setErrors(translateRuleErrors(validateRule(value).errors, t))
    }, [value, t])

    const handleTypeChange = (type: Rule['type']) => {
        // NFR-04-05: switching rule type clears params that no longer apply
        onChange(defaultRuleFor(type))
    }

    const RULE_TYPES: Rule['type'][] = ['flat', 'hours', 'capped', 'cappedPerDocument']

    return (
        <div className="space-y-4">
            <div className="space-y-2">
                <Label>{t('rule.typeLabel')}</Label>
                <Select value={value.type} onValueChange={(v) => handleTypeChange(v as Rule['type'])}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {RULE_TYPES.map((rt) => (
                            <SelectItem key={rt} value={rt}>
                                {t(`rule.types.${rt}`)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {value.type === 'flat' && (
                <div className="space-y-2">
                    <Label>{t('rule.pointsPerDocument')}</Label>
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
                        <Label>{t('rule.pointsAwarded')}</Label>
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
                        <Label>{t('rule.perNHours')}</Label>
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
                    <InnerRuleEditor inner={value.inner} onChange={(inner) => onChange({ ...value, inner })} />
                    <div className="space-y-2">
                        <Label>{t('rule.maxTotalPoints')}</Label>
                        <Input
                            type="number"
                            min={0}
                            step="any"
                            value={value.cap}
                            onChange={(e) => onChange({ ...value, cap: Number(e.target.value) })}
                        />
                        <p className="text-xs text-muted-foreground">{t('rule.maxTotalPointsHint')}</p>
                    </div>
                </div>
            )}

            {value.type === 'cappedPerDocument' && (
                <div className="space-y-4 rounded-md border p-3">
                    <InnerRuleEditor inner={value.inner} onChange={(inner) => onChange({ ...value, inner })} />
                    <div className="space-y-2">
                        <Label>{t('rule.maxPerDocumentPoints')}</Label>
                        <Input
                            type="number"
                            min={0}
                            step="any"
                            value={value.capPerDocument}
                            onChange={(e) => onChange({ ...value, capPerDocument: Number(e.target.value) })}
                        />
                        <p className="text-xs text-muted-foreground">{t('rule.maxPerDocumentHint')}</p>
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