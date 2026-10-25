/**
 * Line icons for the main tasks, drawn to match the tab bar's (1.6 stroke
 * on a 22 grid). Each task keeps the same icon wherever it appears, so the
 * picture can do the work a sentence was doing.
 */

type IconProps = { className?: string }

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

export function HireIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14.5 4.5a3.5 3.5 0 0 0-4.6 4.6L4 15a1.4 1.4 0 0 0 2 2l5.9-5.9a3.5 3.5 0 0 0 4.6-4.6l-2.1 2.1-1.9-.5-.5-1.9z" />
    </Svg>
  )
}

export function WorkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3.5" y="7" width="15" height="10.5" rx="1.5" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h3A1.5 1.5 0 0 1 14 5.5V7M3.5 11.5h15" />
    </Svg>
  )
}

export function MarketIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 8h12l-1 10H6zM8.5 8V6.5a2.5 2.5 0 0 1 5 0V8" />
    </Svg>
  )
}

export function ManualIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 5.5C6 4.5 8.5 4.5 11 6c2.5-1.5 5-1.5 7-.5v11c-2-1-4.5-1-7 .5-2.5-1.5-5-1.5-7-.5zM11 6v11" />
    </Svg>
  )
}

export function CalculatorIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="3.5" width="12" height="15" rx="1.5" />
      <path d="M7.5 6.5h7M8 10.5h.01M11 10.5h.01M14 10.5h.01M8 13.5h.01M11 13.5h.01M14 13.5v2.5M8 16h3" />
    </Svg>
  )
}

export function DoorIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.5 18.5V8L11 3.5 18.5 8v10.5" />
      <path d="M6 18.5V10h10v8.5M6 12.8h10M6 15.6h10" />
    </Svg>
  )
}

export function IdentifyIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="10" cy="10" r="5.5" />
      <path d="m18 18-4-4M8 10h4M10 8v4" />
    </Svg>
  )
}

export function ComplianceIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 3.5 17.5 6v5c0 3.6-2.7 6.5-6.5 7.5-3.8-1-6.5-3.9-6.5-7.5V6z" />
      <path d="m8.2 11 2 2 3.6-3.8" />
    </Svg>
  )
}

export function HelpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="7.5" />
      <path d="M8.9 8.8a2.2 2.2 0 1 1 3 2.1c-.6.3-.9.8-.9 1.4v.5M11 15.4h.01" />
    </Svg>
  )
}
