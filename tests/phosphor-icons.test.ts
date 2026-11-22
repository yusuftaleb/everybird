// The local Phosphor icons (src/components/phosphor-icons.ts) draw exactly what @phosphor-icons/react draws, for every
// weight the site uses, and nothing else imports the package's icons (each of its modules carries all six weights).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import * as Phosphor from '@phosphor-icons/react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import * as Local from '@/components/phosphor-icons'

const ROOT = join(__dirname, '..')
const icons = Local.ICON_WEIGHTS
const draw = (C: unknown, props: Record<string, unknown>) => renderToStaticMarkup(createElement(C as Phosphor.Icon, props))

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    return statSync(p).isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(f) ? [p] : []
  })
}
const files = [...sources(join(ROOT, 'src')), ...sources(join(ROOT, 'app'))].map((p) => [p.slice(ROOT.length + 1), readFileSync(p, 'utf8')] as const)

describe('local Phosphor icons', () => {
  for (const [name, weights] of Object.entries(icons)) {
    for (const weight of weights) {
      it(`${name} (${weight}) draws Phosphor's paths`, () => {
        for (const props of [{ weight }, { weight, size: 18, className: 'x', 'aria-hidden': 'true' }]) {
          const mine = draw((Local as Record<string, unknown>)[name], props)
          expect(mine).toBe(draw((Phosphor as Record<string, unknown>)[name], props))
          expect(mine).toMatch(/<path |<circle |<rect |<line |<polyline /) // a drawing, not an empty svg
        }
        if (weight === 'regular') expect(draw((Local as Record<string, unknown>)[name], {})).toBe(draw((Phosphor as Record<string, unknown>)[name], {}))
      })
    }
  }

  it('every icon drawn in JSX carries the weight it is drawn in (regular when none is given)', () => {
    for (const [file, text] of files) {
      for (const name of Object.keys(icons)) {
        for (const tag of text.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))) {
          const w = /weight="(\w+)"/.exec(tag[0])?.[1] ?? 'regular'
          if (file.startsWith('app/')) continue // the server pages' /ssr icons
          expect(icons[name], `${file}: ${tag[0]}`).toContain(w)
        }
      }
    }
  })

  it("nothing else imports the package's icons (IconBase and types aside; the server pages' /ssr icons ship no JavaScript)", () => {
    for (const [file, text] of files) {
      for (const m of text.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+'(@phosphor-icons\/react[^']*)'/g)) {
        if (file === 'src/components/phosphor-icons.ts' || m[1]) continue
        if (m[3] === '@phosphor-icons/react/ssr' && file.startsWith('app/') && file.endsWith('page.tsx')) continue
        const names = m[2].split(',').map((n) => n.trim()).filter((n) => n && !n.startsWith('type '))
        expect(names, file).toEqual(['IconBase'])
      }
    }
  })
})
