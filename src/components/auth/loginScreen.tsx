import { useState } from 'react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'

export function LoginScreen() {
  const { step, email, loading, error, requestCode, verifyCode, reset } = useAuthStore()
  const [emailInput, setEmailInput] = useState('')
  const [codeInput, setCodeInput] = useState('')

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Certificate Portfolio</CardTitle>
          <CardDescription>
            {step === 'email'
              ? 'Sign in with your institutional email.'
              : `Enter the code sent to ${email}.`}
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
              <Button type="submit" className="w-full" disabled={loading || !emailInput}>
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
                <Label htmlFor="code">6-digit code</Label>
                <InputOTP maxLength={6} value={codeInput} onChange={setCodeInput}>
                  <InputOTPGroup>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <p className="text-xs text-muted-foreground">
                  Check the terminal — the mock code is logged there.
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading || codeInput.length < 6}>
                {loading ? 'Verifying…' : 'Verify'}
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={reset}>
                Use a different email
              </Button>
            </form>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    </div>
  )
}