import { startTransition, type FormEvent } from 'react'

/**
 * Submits a form to a server action without clearing it.
 *
 * React 19 resets a form's fields once its `action` finishes. That is
 * fine on success, when the page moves on, but on an error it wipes what
 * the person typed — a sign-up refused for a mistyped ABN came back with
 * every field empty. Calling the action from onSubmit instead keeps the
 * values. The clicked button travels with the data (FormData's submitter),
 * so forms with several named submit buttons still work.
 */
export function keepValuesOnSubmit(action: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null
    const formData = new FormData(event.currentTarget, submitter)
    startTransition(() => action(formData))
  }
}
