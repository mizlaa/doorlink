'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'
import { confirmMfaSetupAction, disableMfaAction, regenerateRecoveryCodesAction, verifyMfaAction, type MfaState } from '@/lib/mfa/actions'

function CodeInput({ label = 'Code from your app', allowRecovery = false }: { label?: string; allowRecovery?: boolean }) {
  return (
    <Field label={label} htmlFor="code" hint={allowRecovery ? 'Or one of your recovery codes, like K7QX2-MP4RD.' : undefined}>
      <Input id="code" name="code" required autoComplete="one-time-code" inputMode={allowRecovery ? 'text' : 'numeric'} maxLength={allowRecovery ? 12 : 6} className="font-code text-lg tracking-widest" />
    </Field>
  )
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  return (
    <div className="rounded-lg border-2 border-caution/50 bg-caution-tint p-4">
      <p className="font-semibold text-graphite">Save these recovery codes now</p>
      <p className="mt-1 text-sm text-graphite-soft">If you lose your phone, each one gets you in once. They won’t be shown again. Print them or keep them in a password manager, not on the same phone.</p>
      <ol className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 font-code text-sm text-graphite">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ol>
      <button type="button" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))} className="mt-3 text-sm font-medium text-signal hover:text-signal-hover">
        Copy all
      </button>
    </div>
  )
}

/**
 * The whole set-up area as one client component, so the recovery codes
 * shown after confirming survive the page refreshing into its "on" state
 * (turning it on sets the sign-in cookie, which refreshes the page).
 */
export function SecurityPanel({
  mode,
  secretDisplay,
  otpauth,
  unused,
  mustHave,
  startSetup,
}: {
  mode: 'off' | 'setup' | 'on'
  secretDisplay: string | null
  otpauth: string | null
  unused: number
  mustHave: boolean
  startSetup: () => Promise<void>
}) {
  const [state, action, pending] = useActionState(confirmMfaSetupAction, {} as MfaState)
  if (state.codes)
    return (
      <div className="flex flex-col gap-4">
        <p role="status" className="text-sm font-semibold text-good">Two-step sign-in is on.</p>
        <RecoveryCodes codes={state.codes} />
        <a href="/account/security" className="text-sm font-medium text-signal hover:text-signal-hover">
          I’ve saved them
        </a>
      </div>
    )
  if (mode === 'on')
    return (
      <div className="flex flex-col gap-6">
        <p className="font-semibold text-good">
          On · {unused} unused recovery code{unused === 1 ? '' : 's'}
        </p>
        <section>
          <h2 className="mb-2 text-sm font-semibold text-graphite">New recovery codes</h2>
          <RegenerateForm />
        </section>
        {!mustHave && (
          <section className="border-t border-line pt-5">
            <DisableForm />
          </section>
        )}
      </div>
    )
  if (mode === 'setup' && secretDisplay && otpauth)
    return (
      <div className="flex flex-col gap-5">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-graphite">
          <li>
            On this phone,{' '}
            <a href={otpauth} className="font-medium text-signal hover:text-signal-hover">
              open it in your authenticator app
            </a>
            . On another device, add an account in the app and type this key:
            <span data-secret className="mt-2 block break-all rounded border border-line bg-paper p-3 font-code text-base tracking-widest">
              {secretDisplay}
            </span>
          </li>
          <li>Enter the code it shows.</li>
        </ol>
        <form action={action} className="flex flex-col gap-3">
          <CodeInput label="Enter the 6-digit code your app shows" />
          <Button type="submit" disabled={pending}>
            Turn on two-step sign-in
          </Button>
          {state.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
        </form>
      </div>
    )
  return (
    <form action={startSetup}>
      <Button type="submit" size="lg" className="h-12 w-full">
        Set up two-step sign-in
      </Button>
    </form>
  )
}

export function VerifyForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(verifyMfaAction, {} as MfaState)
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next} />
      <CodeInput allowRecovery />
      <Button type="submit" size="lg" className="h-12" disabled={pending}>
        {pending ? 'Checking…' : 'Continue'}
      </Button>
      {state.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
    </form>
  )
}

export function RegenerateForm() {
  const [state, action, pending] = useActionState(regenerateRecoveryCodesAction, {} as MfaState)
  if (state.codes) return <RecoveryCodes codes={state.codes} />
  return (
    <form action={action} className="flex flex-col gap-3">
      <CodeInput />
      <Button type="submit" variant="secondary" disabled={pending}>
        Make new recovery codes
      </Button>
      {state.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
    </form>
  )
}

export function DisableForm() {
  const [state, action, pending] = useActionState(disableMfaAction, {} as MfaState)
  if (state.message) return <p role="status" className="text-sm text-graphite">{state.message}</p>
  return (
    <form action={action} className="flex flex-col gap-3">
      <CodeInput />
      <Button type="submit" variant="ghost" className="text-bad" disabled={pending}>
        Turn off two-step sign-in
      </Button>
      {state.error && <p role="alert" className="text-sm text-bad">{state.error}</p>}
    </form>
  )
}
