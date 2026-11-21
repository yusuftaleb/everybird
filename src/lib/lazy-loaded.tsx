// React.lazy for code split off a page's first load that renders in the same frame once its module is in: `load()` (on
// mount, on intent, in a test's beforeAll) starts the import, and every render after it lands draws the component
// directly; before that it suspends as lazy() does. An instance that first rendered through lazy() stays on it, so a
// module landing mid-life never remounts it.
import { lazy, useRef, type ComponentType } from 'react'

export type Loaded<P> = ComponentType<P> & { load: () => Promise<unknown> }

export function lazyLoaded<P extends object>(get: () => Promise<ComponentType<P>>): Loaded<P> {
  let ready: ComponentType<P> | null = null
  let p: Promise<ComponentType<P>> | null = null
  const load = () => (p ??= get().then((c) => (ready = c), (e: unknown) => { p = null; throw e }))
  const Lazy = lazy(() => load().then((c) => ({ default: c })))
  function Component(props: P) {
    const viaLazy = useRef(!ready)
    const C = viaLazy.current ? Lazy : ready!
    return <C {...props} />
  }
  return Object.assign(Component, { load })
}
