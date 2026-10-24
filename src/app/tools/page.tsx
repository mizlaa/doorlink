import type { Metadata } from 'next'
import { TaskTile } from '@/components/ui/TaskTile'
import { CalculatorIcon, ComplianceIcon, DoorIcon, IdentifyIcon } from '@/components/ui/TaskIcons'

export const metadata: Metadata = {
  title: 'Tools',
  description: 'Spring calculator, door designer, door identifier and compliance pack for door and gate work.',
  alternates: { canonical: '/tools' },
}

// One place for the tools, so each new one is an entry here instead of
// another item in the header.
const TOOLS = [
  { href: '/tools/spring-calculator', title: 'Spring calculator', hint: 'Size a spring', icon: <CalculatorIcon /> },
  { href: '/configure', title: 'Design a door', hint: 'See it on a house', icon: <DoorIcon /> },
  { href: '/find', title: 'Identify my door', hint: 'Find the model', icon: <IdentifyIcon /> },
  { href: '/compliance', title: 'Compliance pack', hint: 'Safety documents', icon: <ComplianceIcon /> },
]

export default function ToolsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold text-graphite">Tools</h1>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <li key={tool.href}>
            <TaskTile href={tool.href} icon={tool.icon} title={tool.title} hint={tool.hint} />
          </li>
        ))}
      </ul>
    </div>
  )
}
