import { useEffect, useState } from 'react'
import { useLocation, matchPath } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { collectionRepository } from '@/repository/collectionRepository'

export interface Breadcrumb {
    label: string
    path?: string
}

const STATIC_LABEL_KEYS: Record<string, string> = {
    documents: 'nav.documents',
    settings: 'nav.settings',
    profile: 'nav.profile',
    preferences: 'nav.preferences',
    reviews: 'nav.review',
    export: 'nav.export',
    report: 'nav.export',
    help: 'nav.help',
    docs: 'nav.documentation',
    support: 'nav.support',
}

const SKIP_AS_CRUMB = new Set(['collections'])

export function useBreadcrumbs(): Breadcrumb[] {
    const { t } = useTranslation('common')
    const location = useLocation()
    const [collectionName, setCollectionName] = useState<string | null>(null)

    const collectionMatch = matchPath(
        { path: '/collections/:collectionId/*', end: false },
        location.pathname
    )
    const collectionId = collectionMatch?.params.collectionId

    useEffect(() => {
        if (!collectionId) {
            setCollectionName(null)
            return
        }
        let cancelled = false
        collectionRepository.get(collectionId).then((c) => {
            if (!cancelled) setCollectionName(c?.name ?? null)
        })
        return () => {
            cancelled = true
        }
    }, [collectionId])

    const segments = location.pathname.split('/').filter(Boolean)

    if (segments.length === 0) {
        return [{ label: t('nav.home') }]
    }

    const crumbs: Breadcrumb[] = [{ label: t('nav.home'), path: '/' }]
    let accumulated = ''

    segments.forEach((seg, i) => {
        accumulated += `/${seg}`
        const isLast = i === segments.length - 1

        if (SKIP_AS_CRUMB.has(seg)) return

        if (seg === collectionId) {
            crumbs.push({
                label: collectionName ?? t('states.loading'),
                path: isLast ? undefined : accumulated,
            })
            return
        }

        const labelKey = STATIC_LABEL_KEYS[seg]
        crumbs.push({ label: labelKey ? t(labelKey) : seg, path: isLast ? undefined : accumulated })
    })

    return crumbs
}