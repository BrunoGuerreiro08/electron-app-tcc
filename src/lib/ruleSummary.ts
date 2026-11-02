import type { Rule } from '@/services/scoringEngine/types'

export function ruleSummary(rule: Rule, t: (key: string, opts?: Record<string, unknown>) => string): string {
    if (rule.type === 'flat') {
        return t('categories:summary.flatPoints', { count: rule.pointsPerUnit })
    }
    if (rule.type === 'hours') {
        return t('categories:summary.hoursPoints', { count: rule.pointsPerUnit, unitSize: rule.unitSize })
    }
    if (rule.type === 'cappedPerDocument') {
        return t('categories:summary.cappedPerDocumentAt', {
            inner: ruleSummary(rule.inner, t),
            cap: rule.capPerDocument,
        })
    }
    return t('categories:summary.cappedAt', { inner: ruleSummary(rule.inner, t), cap: rule.cap })
}
