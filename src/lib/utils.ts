import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// The theme's own font sizes (tailwind.config fontSize). Without telling
// tailwind-merge about them, it reads `text-micro` as a colour and drops it
// whenever a real colour such as `text-graphite` is in the same list — which
// silently turned every 11px badge and label into 16px text.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['micro', 'display', 'display-lg'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
