import type { Config } from 'tailwindcss'

/**
 * Doorlink design tokens.
 *
 * The Doorlink colour system: bright, architectural and calm. Soft Grey
 * pages, Pure White surfaces, Deep Navy text, and Architectural Blue for
 * actions, selections and focus. Orange is kept only for warnings, and
 * Natural Green for positive status. Token names are semantic and
 * predate this palette, so `graphite` is the text colour and `signal`
 * the action colour.
 *
 * Secondary text uses a slate a step deeper than the #64748B in the
 * brand sheet: that value falls just short of 4.5:1 on the Soft Grey
 * page background, and secondary text sits on both.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F3F6F8',
        rail: '#FFFFFF',
        line: '#DCE4EC',
        zinc: {
          DEFAULT: '#5A6A80',
          deep: '#5A6A80',
        },
        graphite: {
          DEFAULT: '#17324D',
          soft: '#5A6A80',
        },
        signal: {
          DEFAULT: '#1769D2',
          hover: '#1257B0',
          tint: 'rgba(23,105,210,0.10)',
        },
        caution: {
          DEFAULT: '#B4530A',
          tint: 'rgba(180,83,10,0.10)',
        },
        // Natural Green (#70B77E) is too light to carry text; this is the
        // same hue deepened to 4.5:1. Use `natural` for decorative marks.
        good: '#2E7D46',
        natural: '#70B77E',
        bad: '#C0362C',
      },
      fontFamily: {
        sans: ['var(--font-plex-sans)', 'system-ui', 'sans-serif'],
        // Reserved for identifiers: model codes, part numbers, references.
        code: ['var(--font-plex-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        micro: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        display: ['2.75rem', { lineHeight: '1.08', letterSpacing: '-0.022em' }],
        'display-lg': ['3.75rem', { lineHeight: '1.04', letterSpacing: '-0.026em' }],
      },
      borderRadius: {
        DEFAULT: '6px',
        md: '6px',
        lg: '10px',
      },
      boxShadow: {
        panel: '0 1px 2px rgba(23, 50, 77, 0.05), 0 12px 28px -12px rgba(23, 50, 77, 0.16)',
        lift: '0 1px 2px rgba(23, 50, 77, 0.06), 0 18px 36px -14px rgba(23, 50, 77, 0.22)',
      },
      maxWidth: {
        prose: '68ch',
        shell: '78rem',
      },
    },
  },
  plugins: [],
}

export default config
