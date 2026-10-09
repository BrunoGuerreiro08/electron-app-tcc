import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FolderOpen, Info, Loader2, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { useAuthStore } from '@/store/authStore'
import { useSettingsStore } from '@/store/settingsStore'

export function ProfileScreen() {
    const { t } = useTranslation(['settings', 'common'])
    const session = useAuthStore((s) => s.session)
    const authStatus = useAuthStore((s) => s.authStatus)
    const isGuest = !session || session.isGuest === true
    // Name/email live on the server: editable only with a confirmed session.
    const canEditAccount = !isGuest && authStatus === 'authenticated'
    const blockedNotice =
        authStatus === 'offline'
            ? t('settings:profile.offlineNotice')
            : authStatus === 'expired'
              ? t('settings:profile.expiredNotice')
              : null

    return (
        <div className="space-y-8 p-6">
            <div>
                <h1 className="text-2xl font-semibold">{t('settings:profile.title')}</h1>
                <p className="text-sm text-muted-foreground">{t('settings:profile.description')}</p>
            </div>

            {isGuest && (
                <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-4 text-sm">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p>{t('settings:profile.guestNotice')}</p>
                </div>
            )}

            {!isGuest && blockedNotice && (
                <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-4 text-sm">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p>{blockedNotice}</p>
                </div>
            )}

            <NameCard currentName={session?.user.name ?? ''} disabled={!canEditAccount} />
            <EmailCard currentEmail={session?.user.email ?? ''} disabled={!canEditAccount} />
            <StorageFolderCard />
        </div>
    )
}

function NameCard({ currentName, disabled }: { currentName: string; disabled: boolean }) {
    const { t } = useTranslation(['settings', 'common'])
    const updateName = useAuthStore((s) => s.updateName)
    // null = untouched, so the field follows the session's current name.
    const [draft, setDraft] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const name = draft ?? currentName
    const trimmed = name.trim()
    const canSave = !disabled && !saving && trimmed.length > 0 && trimmed !== currentName

    const handleSave = async () => {
        setSaving(true)
        setSaved(false)
        setError(null)
        try {
            await updateName(trimmed)
            setDraft(null)
            setSaved(true)
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-base">{t('settings:profile.name.title')}</CardTitle>
                <CardDescription>{t('settings:profile.name.description')}</CardDescription>
            </CardHeader>
            <CardContent>
                <form
                    className="flex flex-col gap-3 sm:flex-row"
                    onSubmit={(e) => {
                        e.preventDefault()
                        if (canSave) handleSave()
                    }}
                >
                    <Label htmlFor="profile-name" className="sr-only">
                        {t('settings:profile.name.title')}
                    </Label>
                    <Input
                        id="profile-name"
                        value={name}
                        onChange={(e) => {
                            setDraft(e.target.value)
                            setSaved(false)
                        }}
                        placeholder={t('settings:profile.name.placeholder')}
                        disabled={disabled}
                        className="sm:max-w-sm"
                    />
                    <Button type="submit" disabled={!canSave}>
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        {t('common:actions.save')}
                    </Button>
                </form>
                {saved && <p className="mt-2 text-sm text-muted-foreground">{t('settings:profile.name.saved')}</p>}
                {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </CardContent>
        </Card>
    )
}

function EmailCard({ currentEmail, disabled }: { currentEmail: string; disabled: boolean }) {
    const { t } = useTranslation('settings')
    const [open, setOpen] = useState(false)
    const [saved, setSaved] = useState(false)

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 gap-4">
                <div>
                    <CardTitle className="text-base">{t('profile.email.title')}</CardTitle>
                    <CardDescription>{t('profile.email.description')}</CardDescription>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    disabled={disabled}
                    onClick={() => {
                        setSaved(false)
                        setOpen(true)
                    }}
                >
                    <Mail className="h-4 w-4" />
                    {t('profile.email.change')}
                </Button>
            </CardHeader>
            <CardContent>
                <p className="text-sm">{currentEmail}</p>
                {saved && <p className="mt-2 text-sm text-muted-foreground">{t('profile.email.saved')}</p>}
            </CardContent>

            <ChangeEmailDialog
                open={open}
                onOpenChange={setOpen}
                onChanged={() => {
                    setOpen(false)
                    setSaved(true)
                }}
            />
        </Card>
    )
}

function ChangeEmailDialog({
    open,
    onOpenChange,
    onChanged,
}: {
    open: boolean
    onOpenChange: (open: boolean) => void
    onChanged: () => void
}) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                {/* Mounted only while open, so each opening starts from step 1. */}
                <ChangeEmailForm onChanged={onChanged} />
            </DialogContent>
        </Dialog>
    )
}

function ChangeEmailForm({ onChanged }: { onChanged: () => void }) {
    const { t } = useTranslation(['settings', 'common'])
    const requestEmailChange = useAuthStore((s) => s.requestEmailChange)
    const confirmEmailChange = useAuthStore((s) => s.confirmEmailChange)

    const [step, setStep] = useState<'email' | 'code'>('email')
    const [newEmail, setNewEmail] = useState('')
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

    return (
        <>
            <DialogHeader>
                <DialogTitle>{t('settings:profile.email.dialog.title')}</DialogTitle>
                <DialogDescription>
                    {step === 'email'
                        ? t('settings:profile.email.dialog.emailStep')
                        : t('settings:profile.email.dialog.codeStep', { email: newEmail.trim() })}
                </DialogDescription>
            </DialogHeader>

            {step === 'email' ? (
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault()
                        run(async () => {
                            await requestEmailChange(newEmail.trim())
                            setStep('code')
                        })
                    }}
                >
                    <div className="space-y-2">
                        <Label htmlFor="new-email">{t('settings:profile.email.dialog.newEmail')}</Label>
                        <Input
                            id="new-email"
                            type="email"
                            autoFocus
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                        />
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                    <Button type="submit" className="w-full" disabled={loading || !newEmail.trim()}>
                        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                        {t('settings:profile.email.dialog.sendCode')}
                    </Button>
                </form>
            ) : (
                <form
                    className="space-y-4"
                    onSubmit={(e) => {
                        e.preventDefault()
                        run(async () => {
                            await confirmEmailChange(newEmail.trim(), code)
                            onChanged()
                        })
                    }}
                >
                    <div className="flex justify-center">
                        <InputOTP maxLength={6} value={code} onChange={setCode}>
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
                        {t('settings:profile.email.dialog.confirm')}
                    </Button>
                    <Button
                        type="button"
                        variant="ghost"
                        className="w-full"
                        onClick={() => {
                            setStep('email')
                            setCode('')
                            setError(null)
                        }}
                    >
                        {t('settings:profile.email.dialog.useAnother')}
                    </Button>
                </form>
            )}
        </>
    )
}

// Moved from the home screen so every setting lives in one predictable place.
function StorageFolderCard() {
    const { t } = useTranslation(['settings', 'common'])
    const { storageFolder, isCustomFolder, migrating, error, load, changeFolder } = useSettingsStore()

    useEffect(() => {
        load()
    }, [load])

    return (
        <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 gap-4">
                <div>
                    <CardTitle className="text-base">{t('settings:storage.title')}</CardTitle>
                    <CardDescription>
                        {t(isCustomFolder ? 'settings:storage.custom' : 'settings:storage.default')}
                    </CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={changeFolder} disabled={migrating}>
                    {migrating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                    {t(migrating ? 'settings:storage.moving' : 'common:actions.changeFolder')}
                </Button>
            </CardHeader>
            <CardContent>
                <code className="text-xs text-muted-foreground break-all">
                    {storageFolder ?? t('common:states.loading')}
                </code>
                <p className="mt-2 text-sm text-muted-foreground">{t('settings:storage.hint')}</p>
                {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </CardContent>
        </Card>
    )
}
