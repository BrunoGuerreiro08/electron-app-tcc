import type { TFunction } from 'i18next'
import type { TemplateError, TemplateErrorLocation } from '@/types/entities'

/**
 * Turns the structured errors from the shared template validator into
 * messages in the app's language, prefixed with a readable location —
 * "Grupo I › I3 › Orientação (regra interna): …" rather than
 * "groups[0].subgroups[2].categories[1].rule.inner". Same split as
 * translateRuleErrors: the validator stays i18n-free, translation happens
 * here, one layer up.
 */
export function translateTemplateErrors(errors: TemplateError[], t: TFunction): string[] {
    return errors.map((error) => {
        const message = t(`collections:templateErrors.${error.key}`, error.params)
        const where = describeLocation(error.at, t)
        return where ? `${where}: ${message}` : message
    })
}

function describeLocation(at: TemplateErrorLocation | undefined, t: TFunction): string {
    if (!at) return ''

    // Each level prefers the item's own name and falls back to its position.
    const level = (kind: 'group' | 'subgroup' | 'category' | 'document', index?: number, name?: string) => {
        if (index == null) return null
        return name ?? t(`collections:templateErrors.location.${kind}`, { position: index + 1 })
    }

    const parts = [
        level('group', at.group, at.groupName),
        level('subgroup', at.subgroup, at.subgroupName),
        level('category', at.category, at.categoryName),
        level('document', at.document, at.documentTitle),
    ].filter((part): part is string => part !== null)

    const path = parts.join(' › ')
    return at.innerRule ? `${path} (${t('collections:templateErrors.location.innerRule')})` : path
}
