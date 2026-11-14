import { useTranslation } from 'react-i18next'
import { AlertTriangle, CloudCheck, CloudOff, Loader2, X } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSyncStore } from '@/store/syncStore'
import type { SyncState } from '../../../shared/syncProtocol'
import { cn } from '@/lib/utils'

type Shown = Exclude<SyncState, 'disabled' | 'unauthorized'>

const STYLES: Record<Shown, string> = {
    idle: 'border-border bg-muted/50 text-muted-foreground',
    syncing: 'border-border bg-muted/50 text-muted-foreground',
    offline: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    error: 'border-destructive/30 bg-destructive/10 text-destructive',
}

function StatusIcon({ state, className }: { state: Shown; className?: string }) {
    const cls = cn('h-4 w-4 shrink-0', className)
    switch (state) {
        case 'idle':
            return <CloudCheck className={cls} />
        case 'syncing':
            return <Loader2 className={cn(cls, 'animate-spin')} />
        case 'offline':
            return <CloudOff className={cls} />
        case 'error':
            return <AlertTriangle className={cls} />
    }
}

/**
 * Whether local changes have reached the server. Hidden for guests (nothing
 * syncs) and while the session is expired (AuthStatusIndicator covers that).
 */
export function SyncStatusIndicator({ variant = 'full' }: { variant?: 'full' | 'icon' }) {
    const { t, i18n } = useTranslation()
    const status = useSyncStore((s) => s.status)
    const syncNow = useSyncStore((s) => s.syncNow)
    const clearNotices = useSyncStore((s) => s.clearNotices)

    if (status.state === 'disabled' || status.state === 'unauthorized') return null
    const state: Shown = status.state

    const label =
        state === 'idle' && status.pending === 0
            ? t('sync.synced')
            : state === 'syncing'
              ? t('sync.syncing')
              : state === 'error'
                ? t('sync.error')
                : t('sync.pending', { count: status.pending })
    const tooltip =
        state === 'error'
            ? t('sync.errorTooltip')
            : status.lastSyncedAt
              ? t('sync.lastSynced', {
                    time: new Date(status.lastSyncedAt).toLocaleTimeString(i18n.language, { timeStyle: 'short' }),
                })
              : t('sync.neverSynced')

    const onClick = state === 'syncing' ? undefined : () => void syncNow()

    const badge =
        variant === 'icon' ? (
            <button
                type="button"
                onClick={onClick}
                aria-label={label}
                className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-md border transition-colors',
                    STYLES[state],
                    !onClick && 'cursor-default'
                )}
            >
                <StatusIcon state={state} />
            </button>
        ) : (
            <div className={cn('flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs', STYLES[state])}>
                <StatusIcon state={state} className="h-3.5 w-3.5" />
                <span className="truncate">{label}</span>
                {onClick && (
                    <button type="button" onClick={onClick} className="ml-auto shrink-0 underline-offset-2 hover:underline">
                        {t('sync.syncNow')}
                    </button>
                )}
            </div>
        )

    return (
        <>
            <Tooltip>
                <TooltipTrigger asChild>{badge}</TooltipTrigger>
                <TooltipContent side={variant === 'icon' ? 'right' : 'top'} className="max-w-64">
                    {variant === 'icon' && <p className="font-medium">{label}</p>}
                    <p>{tooltip}</p>
                </TooltipContent>
            </Tooltip>
            {variant === 'full' && status.detachedRemotely.length > 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-700 dark:text-amber-400">
                    <span className="flex-1">
                        {t('sync.detachedRemotely', { names: status.detachedRemotely.join(', ') })}
                    </span>
                    <button type="button" onClick={() => void clearNotices()} aria-label={t('actions.close')}>
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
            )}
        </>
    )
}
