import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuthStore } from '@/store/authStore'
import { usePreferencesStore } from '@/store/preferenceStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Sun, Moon, Monitor, User } from 'lucide-react'
import { useServerStatusStore } from '@/store/serverStatusStore'
import { ServerStatusIndicator } from '@/components/layout/serverStatusIndicator'

export function LoginScreen() {
  const { t, i18n } = useTranslation('auth')
  const serverStatus = useServerStatusStore((s) => s.status)

  const { step, email, loading, error, requestCode, verifyCode, completeProfile, reset, loginAsGuest } =
    useAuthStore()

  const theme = usePreferencesStore((s) => s.theme)
  const setTheme = usePreferencesStore((s) => s.setTheme)
  const setLanguage = usePreferencesStore((s) => s.setLanguage)
  const [emailInput, setEmailInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [nameInput, setNameInput] = useState('')

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  const themeLabelKey =
    theme === 'light' ? 'login.brand.themeLight' : theme === 'dark' ? 'login.brand.themeDark' : 'login.brand.themeSystem'

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">

      <Button
        variant="ghost"
        size="icon"
        onClick={cycleTheme}
        className="group absolute top-4 right-4 h-9 w-9 rounded-md md:top-6 md:right-6 hover:bg-muted"
        title={t('login.brand.themeTooltip', { theme: t(themeLabelKey) })}
      >
        {theme === 'light' && <Sun className="h-4 w-4 transition-transform duration-300 group-hover:rotate-45" />}
        {theme === 'dark' && <Moon className="h-4 w-4 transition-transform duration-300 group-hover:-rotate-12" />}
        {theme === 'system' && <Monitor className="h-4 w-4 transition-transform duration-300 group-hover:scale-105" />}
        <span className="sr-only">{t('login.brand.toggleTheme')}</span>
      </Button>

      <button
        className="fixed bottom-4 left-4 text-xs underline"
        onClick={() => setLanguage(i18n.language === 'en' ? 'pt-BR' : 'en')}
      >
        {i18n.language}
      </button>

      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="#" className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          </div>
          Docenti
        </a>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>{t('login.cardTitle')}</CardTitle>
            <CardDescription>
              {step === 'email' && t('login.description.email')}
              {step === 'code' && t('login.description.code', { email })}
              {step === 'onboarding' && t('login.description.onboarding')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 'email' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  requestCode(emailInput)
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="email">{t('login.emailStep.label')}</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder={t('login.emailStep.placeholder')}
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    autoFocus
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !emailInput || serverStatus === 'offline'}
                >
                  {loading ? t('login.emailStep.submitLoading') : t('login.emailStep.submitIdle')}
                </Button>

                {/* ADDED: Visual divider and Guest Mode button */}
                <div className="relative my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-card px-2 text-muted-foreground">
                      {t('login.emailStep.orDivider')}
                    </span>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  disabled={loading}
                  onClick={() => loginAsGuest && loginAsGuest()}
                >
                  <User className="h-4 w-4" />
                  {t('login.emailStep.guestMode')}
                </Button>
              </form>
            )}

            {step === 'code' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  verifyCode(codeInput)
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="code" className="text-center block w-full">
                    {t('login.codeStep.label')}
                  </Label>

                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={codeInput} onChange={setCodeInput}>
                      <InputOTPGroup>
                        {Array.from({ length: 6 }).map((_, i) => (
                          <InputOTPSlot key={i} index={i} />
                        ))}
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" className="w-full" disabled={loading || codeInput.length < 6}>
                  {loading ? t('login.codeStep.submitLoading') : t('login.codeStep.submitIdle')}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={reset}>
                  {t('login.codeStep.useDifferentEmail')}
                </Button>
              </form>
            )}

            {step === 'onboarding' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  completeProfile(nameInput)
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="name">{t('login.onboardingStep.label')}</Label>
                  <Input
                    id="name"
                    placeholder={t('login.onboardingStep.placeholder')}
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    autoFocus
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading || !nameInput.trim()}>
                  {loading ? t('login.onboardingStep.submitLoading') : t('login.onboardingStep.submitIdle')}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
        <ServerStatusIndicator />
      </div>
    </div>
  )
}