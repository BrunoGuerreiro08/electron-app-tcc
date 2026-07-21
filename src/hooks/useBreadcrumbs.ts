import { useEffect, useState } from 'react'
import { useLocation, matchPath } from 'react-router-dom'
import { collectionRepository } from '@/repository/collectionRepository'

export interface Breadcrumb {
    label: string
    path?: string
}

const STATIC_LABELS: Record<string, string> = {
    documents: 'Documents',
    settings: 'Settings',
    report: 'Report',
}

const SKIP_AS_CRUMB = new Set(['collections'])

export function useBreadcrumbs(): Breadcrumb[] {
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
        return [{ label: 'Home' }]
    }

    const crumbs: Breadcrumb[] = [{ label: 'Home', path: '/' }]
    let accumulated = ''

    segments.forEach((seg, i) => {
        accumulated += `/${seg}`
        const isLast = i === segments.length - 1

        if (SKIP_AS_CRUMB.has(seg)) return

        if (seg === collectionId) {
            crumbs.push({
                label: collectionName ?? 'Loading…',
                path: isLast ? undefined : accumulated,
            })
            return
        }

        crumbs.push({ label: STATIC_LABELS[seg] ?? seg, path: isLast ? undefined : accumulated })
    })

    return crumbs
}