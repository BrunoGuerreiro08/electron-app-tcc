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

function InnerRuleEditor({ inner, onChange }: InnerRuleEditorProps) {
    const { t } = useTranslation('categories')

    return (
        <div className="w-full min-w-0 space-y-3">
            <Label className="text-xs font-medium text-muted-foreground block">
                {t('rule.innerRuleTypeLabel')}
            </Label>

            {inner.type === 'flat' && (
                <div className="space-y-2 w-full min-w-0">
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
                <div className="grid grid-cols-2 gap-3 w-full min-w-0">
                    <div className="space-y-2 min-w-0">
                        <Label>{t('rule.pointsAwarded')}</Label>
                        <Input
                            type="number"
                            min={0}
                            step="any"
                            value={inner.pointsPerUnit}
                            onChange={(e) => onChange({ ...inner, pointsPerUnit: Number(e.target.value) })}
                        />
                    </div>
                    <div className="space-y-2 min-w-0">
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
        </div>
    )
}

export function RuleEditor({ value, onChange }: RuleEditorProps) {
    const { t } = useTranslation('categories')
    const [errors, setErrors] = useState<string[]>([])

    useEffect(() => {
        setErrors(translateRuleErrors(validateRule(value).errors, t))
    }, [value, t])

    const handleTypeChange = (type: Rule['type']) => {
        onChange(defaultRuleFor(type))
    }

    const RULE_TYPES: Rule['type'][] = ['flat', 'hours', 'capped', 'cappedPerDocument']

    return (
        <div className="w-full min-w-0 space-y-4">
            <div className="flex flex-col gap-1.5 w-full min-w-0">
                <Label className="text-xs font-medium text-muted-foreground">
                    {t('rule.typeLabel')}
                </Label>
                <Select value={value.type} onValueChange={handleTypeChange}>
                    <SelectTrigger className="w-full min-w-0">
                        <SelectValue placeholder={t('rule.typePlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                        {RULE_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                                {t(`rule.types.${type}`)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {value.type === 'flat' && (
                <div className="space-y-2 w-full min-w-0">
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
                <div className="grid grid-cols-2 gap-3 w-full min-w-0">
                    <div className="space-y-2 min-w-0">
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
                    <div className="space-y-2 min-w-0">
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
                <div className="space-y-4 rounded-md border p-3 w-full min-w-0">
                    <InnerRuleEditor inner={value.inner} onChange={(inner) => onChange({ ...value, inner })} />
                    <div className="space-y-2 w-full min-w-0">
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
                <div className="space-y-4 rounded-md border p-3 w-full min-w-0">
                    <InnerRuleEditor inner={value.inner} onChange={(inner) => onChange({ ...value, inner })} />
                    <div className="space-y-2 w-full min-w-0">
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
                <div className="text-destructive text-xs space-y-1 w-full min-w-0">
                    {errors.map((err, i) => (
                        <p key={i}>{err}</p>
                    ))}
                </div>
            )}
        </div>
    )
}
