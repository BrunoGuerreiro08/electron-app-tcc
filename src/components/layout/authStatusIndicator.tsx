import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { CircleUser, Loader2, ServerOff, ShieldAlert, ShieldCheck, WifiOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { useAuthStore } from '@/store/authStore'
import { useServerStatusStore } from '@/store/serverStatusStore'
import type { AuthStatus } from '@/types/auth'
import { cn } from '@/lib/utils'

const STYLES: Record<AuthStatus, string> = {
    authenticated: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
    offline: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
    checking: 'border-border bg-muted/50 text-muted-foreground',
    expired: 'border-destructive/30 bg-destructive/10 text-destructive',
    guest: 'border-border bg-muted/50 text-muted-foreground',
    'server-mismatch': 'border-destructive/30 bg-destructive/10 text-destructive',
    'no-server': 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
}

function StatusIcon({ status, className }: { status: AuthStatus; className?: string }) {
    const cls = cn('h-4 w-4 shrink-0', className)
    switch (status) {
        case 'authenticated':
            return <ShieldCheck className={cls} />
        case 'offline':
            return <WifiOff className={cls} />
        case 'checking':
            return <Loader2 className={cn(cls, 'animate-spin')} />
        case 'expired':
            return <ShieldAlert className={cls} />
        case 'guest':
            return <CircleUser className={cls} />
        case 'server-mismatch':
        case 'no-server':
            return <ServerOff className={cls} />
    }
}

/**
 * Always-visible authentication context (NFR-14-07): connected, offline on
 * the local token, expired, or guest. Replaces the offline-only server badge.
 */
export function AuthStatusIndicator({ variant = 'full' }: { variant?: 'full' | 'icon' }) {
    const { t, i18n } = useTranslation()
    const authStatus = useAuthStore((s) => s.authStatus)
    const expiresAt = useAuthStore((s) => s.session?.expiresAt)
    const checkServer = useServerStatusStore((s) => s.check)
    const navigate = useNavigate()
    const [reauthOpen, setReauthOpen] = useState(false)

    const label = t(`authStatus.${authStatus}`)
    const tooltip =
        authStatus === 'authenticated' && expiresAt
            ? t('authStatus.authenticatedTooltip', {
                  date: new Date(expiresAt).toLocaleDateString(i18n.language, { dateStyle: 'medium' }),
              })
            : authStatus === 'checking'
              ? label
              : t(`authStatus.${authStatus}Tooltip`)

    // Offline: click retries the connection. Expired: click opens sign-in.
    // Server problems: click goes to where the server is configured.
    const onClick =
        authStatus === 'offline'
            ? checkServer
            : authStatus === 'expired'
              ? () => setReauthOpen(true)
              : authStatus === 'server-mismatch' || authStatus === 'no-server'
                ? () => navigate('/settings/preferences')
                : undefined

    const badge =
        variant === 'icon' ? (
            <button
                type="button"
                onClick={onClick}
                aria-label={label}
                className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-md border transition-colors',
                    STYLES[authStatus],
                    !onClick && 'cursor-default'
                )}
            >
                <StatusIcon status={authStatus} />
            </button>
        ) : (
            <div className={cn('flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs', STYLES[authStatus])}>
                <StatusIcon status={authStatus} className="h-3.5 w-3.5" />
                <span className="truncate">{label}</span>
                {authStatus === 'offline' && (
                    <button type="button" onClick={checkServer} className="ml-auto shrink-0 underline-offset-2 hover:underline">
                        {t('actions.retry')}
                    </button>
                )}
                {authStatus === 'expired' && (
                    <button
                        type="button"
                        onClick={() => setReauthOpen(true)}
                        className="ml-auto shrink-0 font-medium underline-offset-2 hover:underline"
                    >
                        {t('authStatus.reauth.button')}
                    </button>
                )}
                {(authStatus === 'server-mismatch' || authStatus === 'no-server') && (
                    <button
                        type="button"
                        onClick={onClick}
                        className="ml-auto shrink-0 font-medium underline-offset-2 hover:underline"
                    >
                        {t('serverConfig.openSettings')}
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
            <ReauthDialog open={reauthOpen} onOpenChange={setReauthOpen} />
        </>
    )
}

function ReauthDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const { t } = useTranslation()
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{t('authStatus.reauth.title')}</DialogTitle>
                </DialogHeader>
                {/* Mounted only while open, so each opening starts from step 1. */}
                <ReauthForm onDone={() => onOpenChange(false)} />
            </DialogContent>
        </Dialog>
    )
}

function ReauthForm({ onDone }: { onDone: () => void }) {
    const { t } = useTranslation()
    const email = useAuthStore((s) => s.session?.user.email ?? '')
    const requestReauthCode = useAuthStore((s) => s.requestReauthCode)
    const confirmReauthCode = useAuthStore((s) => s.confirmReauthCode)
    const serverOffline = useServerStatusStore((s) => s.status === 'offline')

    const [codeSent, setCodeSent] = useState(false)
    const [code, setCode] = useState('')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const run = async (action: () => Promise<void>) => {
        setLoading(true)
        setError(null)
        try {
            await action()
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setLoading(false)
        }
    }

    const sendCode = () =>
        run(async () => {
            await requestReauthCode()
            setCodeSent(true)
            setCode('')
        })

    if (!codeSent) {
        return (
            <div className="space-y-4">
                <DialogDescription>{t('authStatus.reauth.description', { email })}</DialogDescription>
                {serverOffline && <p className="text-sm text-muted-foreground">{t('authStatus.offlineTooltip')}</p>}
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button className="w-full" onClick={sendCode} disabled={loading || serverOffline}>
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {t('authStatus.reauth.sendCode')}
                </Button>
            </div>
        )
    }

    return (
        <form
            className="space-y-4"
            onSubmit={(e) => {
                e.preventDefault()
                run(async () => {
                    await confirmReauthCode(code)
                    onDone()
                })
            }}
        >
            <DialogDescription>{t('authStatus.reauth.codeSent', { email })}</DialogDescription>
            <div className="flex justify-center">
                <InputOTP maxLength={6} value={code} onChange={setCode} autoFocus>
                    <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, i) => (
                            <InputOTPSlot key={i} index={i} />
                        ))}
                    </InputOTPGroup>
                </InputOTP>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading || code.length < 6}>
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('authStatus.reauth.confirm')}
            </Button>
            <Button type="button" variant="ghost" className="w-full" onClick={sendCode} disabled={loading}>
                {t('authStatus.reauth.resend')}
            </Button>
        </form>
    )
}
