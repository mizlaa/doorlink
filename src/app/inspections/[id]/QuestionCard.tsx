'use client'

import { useState, useTransition } from 'react'
import { AnswerStatus, QuestionType } from '@prisma/client'
import { cn } from '@/lib/utils'
import { Textarea, Select } from '@/components/ui/Field'
import { saveAnswerAction } from '../actions'
import type { WizardAnswer, WizardQuestion } from './types'

// One question. Answering is the only thing this component is for, so
// the pass/fail controls are the largest thing on it: this is used
// outdoors, one-handed, often gloved.

const STATUS_CHOICES: { value: AnswerStatus; label: string; className: string }[] = [
  {
    value: AnswerStatus.PASS,
    label: 'Pass',
    className: 'data-[on=true]:border-good data-[on=true]:bg-good/10 data-[on=true]:text-good',
  },
  {
    value: AnswerStatus.FAIL,
    label: 'Fail',
    className: 'data-[on=true]:border-bad data-[on=true]:bg-bad/10 data-[on=true]:text-bad',
  },
  {
    value: AnswerStatus.NOT_APPLICABLE,
    label: 'N/A',
    className: 'data-[on=true]:border-zinc data-[on=true]:bg-rail data-[on=true]:text-graphite',
  },
  {
    value: AnswerStatus.NOT_TESTED,
    label: 'Not tested',
    className: 'data-[on=true]:border-caution data-[on=true]:bg-caution-tint data-[on=true]:text-caution',
  },
]

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function QuestionCard({
  inspectionId,
  question,
  initial,
  readOnly,
  storageUnavailable,
}: {
  inspectionId: string
  question: WizardQuestion
  initial: WizardAnswer | null
  readOnly: boolean
  storageUnavailable: boolean
}) {
  const [status, setStatus] = useState<AnswerStatus | null>(initial?.status ?? null)
  const [valueText, setValueText] = useState(initial?.valueText ?? '')
  const [choices, setChoices] = useState<string[]>(initial?.valueChoices ?? [])
  const [note, setNote] = useState(initial?.note ?? '')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [, startTransition] = useTransition()

  // Answers save as they are given rather than on a Save button. A
  // technician who loses signal keeps everything up to the last answer
  // that reached the server, and never loses a walkthrough to a locked
  // screen.
  function persist(next: Partial<WizardAnswer>) {
    if (readOnly) return
    setSaveState('saving')
    startTransition(async () => {
      const result = await saveAnswerAction({
        inspectionId,
        questionId: question.id,
        status: next.status !== undefined ? next.status : status,
        valueText: next.valueText !== undefined ? next.valueText : valueText,
        valueChoices: next.valueChoices !== undefined ? next.valueChoices : choices,
        note: next.note !== undefined ? next.note : note,
      })
      setSaveState(result.error ? 'error' : 'saved')
    })
  }

  const usesStatus =
    question.type === QuestionType.PASS_FAIL ||
    question.type === QuestionType.PASS_FAIL_NA ||
    question.type === QuestionType.OBSERVATION
  const statusChoices = STATUS_CHOICES.filter(
    (choice) =>
      question.type !== QuestionType.PASS_FAIL || choice.value !== AnswerStatus.NOT_APPLICABLE
  )

  const isYesNo = question.type === QuestionType.YES_NO || question.type === QuestionType.YES_NO_NA
  const isSelect =
    question.type === QuestionType.SINGLE_SELECT ||
    question.type === QuestionType.DROPDOWN ||
    question.type === QuestionType.SEARCHABLE_DROPDOWN
  const isMulti = question.type === QuestionType.MULTI_SELECT
  const isFreeText = question.type === QuestionType.TEXT
  const isPhotoQuestion = question.type === QuestionType.PHOTO || question.type === QuestionType.VIDEO

  const failed = status === AnswerStatus.FAIL
  const needsNote = question.requiresNoteWhenFailed && failed && note.trim().length === 0
  const needsPhoto = question.requirePhoto && (initial?.evidenceCount ?? 0) === 0

  return (
    <li
      id={`q-${question.code}`}
      className={cn(
        'scroll-mt-28 rounded-md border bg-paper p-4',
        failed ? 'border-bad/40 shadow-[inset_3px_0_0_0_theme(colors.bad)]' : 'border-line'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-graphite">
          {question.prompt}
          {!question.required && <span className="ml-2 text-micro font-normal text-zinc">Optional</span>}
        </p>
        <span className="shrink-0 text-micro text-zinc" aria-live="polite">
          {saveState === 'saving' && 'Saving…'}
          {saveState === 'saved' && 'Saved'}
          {saveState === 'error' && <span className="text-bad">Not saved</span>}
        </span>
      </div>

      {question.helpText && <p className="mt-1 text-sm text-zinc-deep">{question.helpText}</p>}

      {usesStatus && (
        <div className="mt-3 flex flex-wrap gap-2">
          {statusChoices.map((choice) => (
            <button
              key={choice.value}
              type="button"
              disabled={readOnly}
              data-on={status === choice.value}
              aria-pressed={status === choice.value}
              onClick={() => {
                const next = status === choice.value ? null : choice.value
                setStatus(next)
                persist({ status: next })
              }}
              className={cn(
                'h-11 min-w-[72px] rounded border border-line bg-paper px-4 text-sm font-medium text-graphite-soft',
                'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal',
                'disabled:opacity-60',
                choice.className
              )}
            >
              {choice.label}
            </button>
          ))}
        </div>
      )}

      {isYesNo && (
        <div className="mt-3 flex flex-wrap gap-2">
          {['YES', 'NO', ...(question.type === QuestionType.YES_NO_NA ? ['N/A'] : [])].map((option) => (
            <button
              key={option}
              type="button"
              disabled={readOnly}
              data-on={valueText === option}
              aria-pressed={valueText === option}
              onClick={() => {
                const next = valueText === option ? '' : option
                setValueText(next)
                persist({ valueText: next })
              }}
              className="h-11 min-w-[72px] rounded border border-line bg-paper px-4 text-sm font-medium text-graphite-soft data-[on=true]:border-signal data-[on=true]:bg-signal-tint data-[on=true]:text-signal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-signal disabled:opacity-60"
            >
              {option}
            </button>
          ))}
        </div>
      )}

      {isSelect && (
        <Select
          className="mt-3"
          value={valueText}
          disabled={readOnly}
          onChange={(event) => {
            setValueText(event.target.value)
            persist({ valueText: event.target.value })
          }}
        >
          <option value="">Choose…</option>
          {question.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      )}

      {isMulti && (
        <div className="mt-3 grid gap-2">
          {question.options.map((option) => {
            const on = choices.includes(option)
            return (
              <label
                key={option}
                className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded border border-line px-3 py-2 text-sm text-graphite has-[:checked]:border-signal has-[:checked]:bg-signal-tint"
              >
                <input
                  type="checkbox"
                  checked={on}
                  disabled={readOnly}
                  onChange={() => {
                    const next = on ? choices.filter((c) => c !== option) : [...choices, option]
                    setChoices(next)
                    persist({ valueChoices: next })
                  }}
                  className="h-5 w-5 accent-[#1B4FA8]"
                />
                {option}
              </label>
            )
          })}
        </div>
      )}

      {isFreeText && (
        <Textarea
          className="mt-3"
          value={valueText}
          disabled={readOnly}
          onChange={(event) => setValueText(event.target.value)}
          onBlur={() => persist({ valueText })}
        />
      )}

      {isPhotoQuestion && (
        <div className="mt-3">
          <EvidenceSlot
            storageUnavailable={storageUnavailable}
            count={initial?.evidenceCount ?? 0}
            required={question.requirePhoto}
          />
        </div>
      )}

      {/* The explanation box appears the moment something fails, rather
          than behind an "add note" control — the note is the part of a
          failed answer a customer actually reads. */}
      {(failed || note.length > 0 || question.recommendPhoto) && !isFreeText && (
        <div className="mt-3">
          <label htmlFor={`note-${question.code}`} className="text-micro font-medium text-graphite-soft">
            {failed ? 'What did you find?' : 'Note'}
          </label>
          <Textarea
            id={`note-${question.code}`}
            className="mt-1 min-h-20"
            value={note}
            disabled={readOnly}
            placeholder={failed ? 'Describe the condition you observed.' : 'Optional'}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => persist({ note })}
          />
          {needsNote && (
            <p className="mt-1 text-micro text-bad">An explanation is required before you can finish.</p>
          )}
        </div>
      )}

      {!isPhotoQuestion && (failed || question.requirePhoto || question.recommendPhoto) && (
        <div className="mt-3">
          <EvidenceSlot
            storageUnavailable={storageUnavailable}
            count={initial?.evidenceCount ?? 0}
            required={needsPhoto || (failed && question.requiresPhotoWhenFailed)}
          />
        </div>
      )}
    </li>
  )
}

/**
 * Photo capture has no working backend: `src/lib/storage.ts` has no
 * upload path until Supabase Storage is configured. Rendering a camera
 * button that silently discarded a technician's evidence would be worse
 * than rendering nothing, so this says plainly what is missing — the
 * repo's standing rule is not to make dead controls look live.
 */
function EvidenceSlot({
  storageUnavailable,
  count,
  required,
}: {
  storageUnavailable: boolean
  count: number
  required: boolean
}) {
  if (storageUnavailable) {
    return (
      <div className="rounded border border-caution/30 bg-caution-tint px-3 py-2 text-micro text-graphite-soft">
        <span className="font-medium text-caution">Photo capture is not available.</span> File storage is
        not configured on this deployment, so a photo taken here could not be saved.
        {required && ' This question asks for one, so it cannot be satisfied until storage is set up.'}
      </div>
    )
  }

  return (
    <div className="rounded border border-line px-3 py-2 text-micro text-graphite-soft">
      {count > 0 ? `${count} photo${count === 1 ? '' : 's'} attached.` : 'No photo attached yet.'}
      {required && count === 0 && <span className="ml-1 text-bad">A photo is required.</span>}
    </div>
  )
}
