import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useServerStatusStore } from '@/store/serverStatusStore'
import { ServerStatusIndicator } from '@/components/layout/serverStatusIndicator'

export function LoginScreen() {
  const serverStatus = useServerStatusStore((s) => s.status)
  const { step, email, loading, error, requestCode, verifyCode, completeProfile, reset } =
    useAuthStore()
  const { theme, setTheme } = useTheme()
  const [emailInput, setEmailInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [nameInput, setNameInput] = useState('')

  const cycleTheme = () => {
    if (theme === 'light') setTheme('dark')
    else if (theme === 'dark') setTheme('system')
    else setTheme('light')
  }

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">

      <Button
        variant="ghost"
        size="icon"

        onClick={cycleTheme}
        className="group absolute top-4 right-4 h-9 w-9 rounded-md md:top-6 md:right-6 hover:bg-muted"

        title={`Current theme: ${theme}. Click to change.`}
      >
        {theme === 'light' && <Sun className="h-4 w-4 transition-transform duration-300 group-hover:rotate-45" />}
        {theme === 'dark' && <Moon className="h-4 w-4 transition-transform duration-300 group-hover:-rotate-12" />}
        {theme === 'system' && <Monitor className="h-4 w-4 transition-transform duration-300 group-hover:scale-105" />}
        <span className="sr-only">Toggle theme</span>
      </Button>

      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="#" className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          </div>
          Docenti
        </a>

        <Card className="w-full">
          <CardHeader>
            <CardTitle>Certificate Portfolio</CardTitle>
            <CardDescription>
              {step === 'email' && 'Sign in with your institutional email.'}
              {step === 'code' && `Enter the code sent to ${email}.`}
              {step === 'onboarding' && "Welcome! What's your name?"}
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
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@university.edu"
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
                  {loading ? 'Sending code…' : 'Send code'}
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
                    6-digit code
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
                  {loading ? 'Verifying…' : 'Verify'}
                </Button>
                <Button type="button" variant="ghost" className="w-full" onClick={reset}>
                  Use a different email
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
                  <Label htmlFor="name">Your name</Label>
                  <Input
                    id="name"
                    placeholder="Jane Silva"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    autoFocus
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading || !nameInput.trim()}>
                  {loading ? 'Saving…' : 'Continue'}
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