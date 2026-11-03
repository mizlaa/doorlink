import { lazy, Suspense, type ComponentType, type ReactNode } from 'react'

type Loaded<P> = ComponentType<P> | { default: ComponentType<P> }

/** next/dynamic for the demo: React.lazy with the same loading fallback. */
export default function dynamic<P extends object>(
  loader: () => Promise<Loaded<P>>,
  options: { ssr?: boolean; loading?: () => ReactNode } = {}
) {
  const Lazy = lazy(async () => {
    const loaded = await loader()
    const component = (typeof loaded === 'function' || (loaded as { $$typeof?: unknown }).$$typeof
      ? loaded
      : (loaded as { default: ComponentType<P> }).default) as ComponentType<P>
    return { default: component }
  })
  function DynamicComponent(props: P) {
    return (
      <Suspense fallback={options.loading ? options.loading() : null}>
        <Lazy {...props} />
      </Suspense>
    )
  }
  return DynamicComponent
}
