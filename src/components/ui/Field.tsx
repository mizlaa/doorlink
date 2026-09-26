import { forwardRef } from 'react'
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const FIELD_CLASSES = cn(
  'w-full rounded border border-line bg-paper px-3 py-2 text-sm text-graphite placeholder:text-zinc',
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal',
  'disabled:bg-rail disabled:text-zinc'
)

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref
) {
  return <input ref={ref} className={cn(FIELD_CLASSES, 'h-11', className)} {...props} />
})

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(FIELD_CLASSES, 'min-h-28', className)} {...props} />
  }
)

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, ...props },
  ref
) {
  return (
    <select
      ref={ref}
      className={cn(FIELD_CLASSES, 'field-select h-11 appearance-none pr-12', className)}
      {...props}
    />
  )
})

export interface FieldProps {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: ReactNode
}

export function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-graphite">
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-micro text-zinc-deep">{hint}</p>}
      {error && (
        <p className="text-micro text-bad" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
