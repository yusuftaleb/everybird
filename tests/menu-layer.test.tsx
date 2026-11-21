// @vitest-environment jsdom
// Round 6, the menu audit: every menu, popover, tooltip and sheet the site opens, after the share dialog's dropdowns
// opened far from their buttons (an ancestor was the containing block of their fixed box). A fixed layer is placed against
// the window only while no ancestor is its containing block (a transform, translate, scale, rotate, filter, perspective,
// will-change of those, contain layout/paint/strict/content, container-type size/inline-size, or an animation of a
// transform kept in effect by fill-mode both/forwards), and an absolute one is clipped by any ancestor with overflow. The
// shared top layer (src/components/menu-layer.ts) escapes both; its fallback without the popover API is fixed, so its
// ancestors are checked too. LAYERS lists each layer and the classes on its way up to the page; the discovery test fails
// when a new menu or fixed layer appears without an entry.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Tour } from '@/components/app/Tour'
import { SourceRow } from '@/components/import/SourceLine'
import { SourceMenu } from '@/components/import/SourceMenu'
import { menuPlace } from '@/components/menu-layer'
import { withI18n } from './i18n-render'

afterEach(() => { cleanup(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals() })

// ---- The CSS, every stylesheet of the app (the About demo's vendored Stageshow kit draws no real layers). ----
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f)
  return statSync(p).isDirectory() ? (f === 'stageshow' ? [] : walk(p)) : [p]
})
const files = [...walk('src'), ...walk('app')]
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(f, 'utf8')).join('\n').replace(/\/\*[\s\S]*?\*\//g, '')
const keyframes = new Map([...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)[^{}]*\}/g)].map((m) => [m[1], m[2]]))
const rules = [...css.replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((m) => ({ sel: m[1].trim(), body: m[2] }))
/** Every rule whose selector list has a selector ending in `cls` (in any state: `.eb-topbar[data-hidden]` counts). */
const rulesOf = (cls: string) => rules.filter((r) => r.sel.split(',').some((s) => {
  const last = s.trim().split(/[\s>+~]+/).pop() ?? ''
  return last === cls || (last.startsWith(cls) && !/[\w-]/.test(last[cls.length]))
}))
const MOVES = /\b(transform|translate|scale|rotate|filter)\s*:/
/** Why a rule makes its element the containing block of fixed descendants, or null. */
function containingBlock(body: string): string | null {
  for (const d of body.split(';')) {
    const [prop, ...rest] = d.split(':')
    const p = prop?.trim(), v = rest.join(':').trim()
    if (!p || !v) continue
    if (/^(transform|translate|scale|rotate|perspective|filter|backdrop-filter)$/.test(p) && v !== 'none') return `${p}: ${v}`
    if (p === 'contain' && /\b(layout|paint|strict|content)\b/.test(v)) return `${p}: ${v}`
    if (p === 'container-type' && /\b(size|inline-size)\b/.test(v)) return `${p}: ${v}`
    if (p === 'will-change' && /\b(transform|translate|scale|rotate|perspective|filter|contain)\b/.test(v)) return `${p}: ${v}`
    if ((p === 'animation' && /\b(both|forwards)\b/.test(v)) || (p === 'animation-fill-mode' && /\b(both|forwards)\b/.test(v))) {
      const names = p === 'animation' ? v.split(/[\s,]+/) : [...body.matchAll(/animation(?:-name)?\s*:\s*([^;]+)/g)].flatMap((m) => m[1].split(/[\s,]+/))
      const moving = names.find((n) => MOVES.test(keyframes.get(n) ?? ''))
      if (moving) return `${p}: ${v} (keeps @keyframes ${moving}'s transform in effect)`
    }
  }
  return null
}
const clips = (body: string) => /(^|;)\s*overflow(-x|-y)?\s*:\s*(hidden|clip|auto|scroll)/.test(body)

type Layer = {
  name: string
  file: string
  /** The layer's own class (the first listed is its box); `covers` are other fixed boxes it draws (its scrim). */
  cls: string
  covers?: string[]
  /** Other classes on its box (where its position comes from). */
  also?: string[]
  /** top: the shared top layer, fixed without it; fixed: window coordinates; absolute: in its own positioned wrapper. */
  kind: 'top' | 'fixed' | 'absolute'
  /** The classes between the layer and the page (every place it is rendered), up to html. */
  up: string[]
  /** An ancestor's containing block the top layer escapes (its fallback inherits it), with why it stays. */
  allow?: Record<string, string>
}
const PAGE = ['.eb-page', '.eb-page-collage', '.eb-page-landing', '.eb-page-settings', '.eb-page-titled', 'body', 'html']
const VIEW = ['.eb-view', ...PAGE]
const SOURCES = ['.eb-src-main', '.eb-src', '.eb-filedrop', '.eb-srcgroup', '.eb-srclist', '.eb-import', '.eb-block', '.eb-settings-pair', '.eb-settings-one', '.eb-add', '.eb-add-scrim', ...PAGE]
const LAYERS: Layer[] = [
  { name: "Share dialog's dropdowns (MenuSelect `layer`)", file: 'src/components/share/MenuSelect.tsx', cls: '.eb-share-menu', kind: 'top', up: ['.eb-share', '.eb-share-scrim', ...PAGE],
    allow: { '.eb-share-scrim': "container-type: size sizes the card (item 18); the menu is in the top layer" } },
  { name: "Settings' and Add birds' ⋯ source menus (SourceMenu)", file: 'src/components/import/SourceMenu.tsx', cls: '.eb-menu', kind: 'top', up: ['.eb-menuwrap', '.eb-src-acts', ...SOURCES] },
  { name: 'A source row\'s "why?" popover (SourceRow)', file: 'src/components/import/SourceLine.tsx', cls: '.eb-whypop', kind: 'top', up: SOURCES },
  { name: 'Bird card popover and phone sheet (BirdCard)', file: 'src/components/collage/BirdCard.tsx', cls: '.eb-card', covers: ['.eb-card-scrim'], kind: 'fixed', up: VIEW },
  { name: 'The one toast (Toast: "Removed … · Undo" on the collage and in Add by hand; every import\'s, from EverybirdProvider)', file: 'src/components/app/Toast.tsx', cls: '.eb-toast-slot', kind: 'fixed', up: ['.eb-tick', '.eb-add', '.eb-add-scrim', ...PAGE] },
  { name: "The Tree's inside-list sheet (PickerSheet)", file: 'src/components/filters/PickerSheet.tsx', cls: '.eb-sheet', covers: ['.eb-sheet-scrim'], kind: 'fixed', up: ['.eb-tree', ...VIEW] },
  { name: "The dock panels' phone sheets (Filters, Taxa, Display: portalled to the body)", file: 'src/components/filters/Filters.tsx', cls: '.eb-drop-sheet', kind: 'fixed', up: ['body', 'html'] },
  { name: "The sample's tour note (portalled to the body)", file: 'src/components/app/Tour.tsx', cls: '.eb-tour', kind: 'fixed', up: ['body', 'html'] },
  { name: 'The first-visit welcome (portalled to the body)', file: 'src/components/app/Welcome.tsx', cls: '.eb-welcome', covers: ['.eb-welcome-scrim'], kind: 'fixed', up: ['body', 'html'] },
  { name: '"Back to top" (not a popup: a fixed button in the footer)', file: 'src/components/app/BackToTop.tsx', cls: '.eb-totop', kind: 'fixed', up: ['.eb-footer', ...PAGE] },
  { name: "The Add birds dialog (its scrim is the window's box)", file: 'src/components/import/AddBirdsDialog.tsx', cls: '.eb-add-scrim', kind: 'fixed', up: PAGE },
  { name: "The share dialog (its scrim is the window's box)", file: 'src/components/share/ShareDialog.tsx', cls: '.eb-share-scrim', kind: 'fixed', up: PAGE },
  { name: "The top bar's language menu", file: 'src/components/app/LanguageMenu.tsx', cls: '.eb-langmenu', also: ['.eb-menu'], kind: 'absolute', up: ['.eb-langwrap', '.eb-topbar-end', '.eb-topbar-in', '.eb-topbar'] },
  { name: "The List view's Sort menu (MenuList in the dock)", file: 'src/components/app/ControlsBar.tsx', cls: '.eb-menu', kind: 'absolute', up: ['.eb-dock-sortwrap', '.eb-dock-tools', '.eb-dock-filters', '.eb-dock', '.eb-dockwrap', ...VIEW] },
  { name: "The dock search's results", file: 'src/components/app/DockSearch.tsx', cls: '.eb-find-drop', kind: 'absolute', up: ['.eb-find', '.eb-dock', '.eb-dockwrap', ...VIEW] },
  { name: "The dock panels' popovers (Filters, Taxa, Display)", file: 'src/components/filters/Filters.tsx', cls: '.eb-drop', kind: 'absolute', up: ['.eb-dockwrap', ...VIEW] },
  { name: "The collage's bird tooltip (BirdTip)", file: 'src/components/collage/BirdTip.tsx', cls: '.eb-tip', kind: 'absolute', up: ['.eb-stagewrap', ...VIEW] },
  { name: "The Map's place tooltip", file: 'src/components/collage/MapView.tsx', cls: '.eb-map-tip', also: ['.eb-tip'], kind: 'absolute', up: ['.eb-map-art', '.eb-map-pic', '.eb-map', ...VIEW] },
]
/** Files with a menu or listbox role that open nothing floating of their own (the role is on an in-flow list). */
const IN_FLOW: Record<string, string> = {
  'src/components/import/TickList.tsx': "Add by hand's species list is a windowed listbox in the dialog, not a popup",
}

describe('every floating layer is placed against its intended box (the share dialog\'s menu bug, checked site-wide)', () => {
  it.each(LAYERS.filter((l) => l.kind !== 'absolute'))('$name: no ancestor is a containing block for fixed descendants', (l) => {
    const found = l.up.flatMap((cls) => rulesOf(cls).map((r) => ({ cls, sel: r.sel, why: containingBlock(r.body) })))
      .filter((f) => f.why && !l.allow?.[f.cls])
    expect(found, l.kind === 'top' ? 'the fallback without the popover API is fixed too' : '').toEqual([])
  })
  it.each(LAYERS.filter((l) => l.kind === 'absolute'))('$name: in its own wrapper, no ancestor clips it', (l) => {
    expect([l.cls, ...(l.also ?? [])].flatMap(rulesOf).some((r) => /position:\s*absolute/.test(r.body)), 'absolute').toBe(true)
    expect(l.up.flatMap((cls) => rulesOf(cls).filter((r) => clips(r.body)).map((r) => r.sel))).toEqual([])
  })
  it.each(LAYERS.filter((l) => l.kind === 'top'))('$name: uses the shared top-layer placement, its popover box reset', (l) => {
    expect(readFileSync(l.file, 'utf8')).toMatch(/useMenuLayer\(/)
    expect(rulesOf(l.cls).concat(rulesOf('.eb-menu')).some((r) => /\[popover\]/.test(r.sel) && /margin:\s*0/.test(r.body))).toBe(true)
  })
  it('the shared placement is the top layer: popover="manual", showPopover, fixed to the button', () => {
    const src = readFileSync('src/components/menu-layer.ts', 'utf8')
    expect(src).toContain("el.setAttribute('popover', 'manual')")
    expect(src).toContain('el.showPopover()')
    expect(src).toMatch(/position: 'fixed'/)
    expect(css).toMatch(/\.eb-menu\[popover\] \{ margin: 0; color: var\(--ink\); \}/)
  })
  it('the Add birds dialog\'s entry animation does not fill forwards (it held the Undo toast and fixed menus to the dialog)', () => {
    const add = rulesOf('.eb-add').map((r) => r.body).join(';')
    expect(add).toMatch(/animation:\s*eb-add-in [^;]*\bbackwards\b/)
  })
  it('a new menu, listbox or fixed layer needs an entry here', () => {
    const tsx = files.filter((f) => f.endsWith('.tsx') && !f.includes('/about/'))
    const roles = tsx.filter((f) => /role="(menu|listbox|tooltip)"|aria-haspopup="(menu|listbox)"/.test(readFileSync(f, 'utf8')))
    const known = new Set([...LAYERS.map((l) => l.file), ...Object.keys(IN_FLOW)])
    expect(roles.filter((f) => !known.has(f))).toEqual([])
    const fixed = rules.filter((r) => /position:\s*fixed/.test(r.body)).flatMap((r) => r.sel.split(',').map((s) => s.trim().split(/[\s>+~[:]+/).pop()!))
    const boxes = new Set(LAYERS.flatMap((l) => [l.cls, ...(l.covers ?? [])]).concat('.eb-card'))
    expect([...new Set(fixed)].filter((c) => !boxes.has(c) && !c.startsWith('.ebd'))).toEqual([])
  })
})

describe('every menu\'s rows share the language menu\'s treatment (round 6, item 6)', () => {
  const rowRules = rules.filter((r) => /\.eb-menuitem/.test(r.sel))
  const fills = (r: { body: string }) => /background:\s*var\(--surface\)/.test(r.body)
  it('one rule: a fill on hover and on keyboard focus only, never on the current choice; none on a pointer-focused row', () => {
    const filling = rowRules.filter(fills).map((r) => r.sel)
    expect(filling).toEqual([
      '.eb-menuitem:not([aria-checked="true"]):focus-visible',
      '.eb-menuitem:not([aria-checked="true"]):not([aria-disabled="true"]):hover',
    ])
    // No menu's own copy (the language menu's lived under .eb-langmenu), and plain :focus never fills.
    expect(rowRules.filter((r) => /\.eb-langmenu \.eb-menuitem[^,{]*:(hover|focus)/.test(r.sel))).toEqual([])
    expect(rowRules.filter((r) => /:focus(?!-visible)/.test(r.sel) && fills(r))).toEqual([])
    expect(rulesOf('.eb-menuitem').some((r) => r.sel === '.eb-menuitem:focus' && /outline:\s*none/.test(r.body))).toBe(true)
    // Remove keeps its Accent text.
    expect(rules.some((r) => r.sel === '.eb-menuitem[data-danger]' && /color:\s*var\(--accent\)/.test(r.body))).toBe(true)
  })
  it.each(['src/components/import/SourceMenu.tsx', 'src/components/app/LanguageMenu.tsx', 'src/components/share/MenuSelect.tsx'])('%s draws its rows with .eb-menuitem in an .eb-menu', (f) => {
    const src = readFileSync(f, 'utf8')
    expect(src).toMatch(/className="eb-menuitem"/)
    expect(src).toMatch(/className="eb-menu[ "]/)
  })
})

describe('menuPlace: left-aligned layers ("why?")', () => {
  const vw = 1440, vh = 830
  it('puts the layer\'s left edge on the button\'s, under it, kept 8px inside the window', () => {
    const p = menuPlace({ top: 200, bottom: 220, right: 260, left: 230 }, 120, 300, vw, vh, 'start')
    expect(p).toEqual({ up: false, y: 226, maxH: vh - 220 - 6 - 8, right: vw - 230 - 300 })
    expect(menuPlace({ top: 200, bottom: 220, right: 1430, left: 1400 }, 120, 300, vw, vh, 'start').right).toBe(8)
    expect(menuPlace({ top: 200, bottom: 220, right: 10, left: 2 }, 120, 300, vw, vh, 'start').right).toBe(vw - 8 - 300)
  })
  it('opens over the button when it does not fit below and there is more room above', () => {
    expect(menuPlace({ top: 760, bottom: 780, right: 260, left: 230 }, 200, 300, vw, vh, 'start')).toMatchObject({ up: true, y: vh - 760 + 6 })
  })
})

// jsdom has no layout: each test gives the trigger a box; the layer measures 0 × 0.
const box = (el: Element, r: { left: number; top: number; width: number; height: number }) =>
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ ...r, x: r.left, y: r.top, right: r.left + r.width, bottom: r.top + r.height, toJSON: () => ({}) } as DOMRect)
const vw = () => document.documentElement.clientWidth || window.innerWidth
function withPopover(run: (shown: Element[]) => void) {
  const shown: Element[] = []
  Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: function (this: HTMLElement) { shown.push(this) } })
  Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value: () => {} })
  try { run(shown) } finally {
    delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover
    delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover
  }
}

describe('placement at the trigger', () => {
  const items = [{ label: 'Refresh', onSelect: () => {} }, { label: 'Remove', danger: true, onSelect: () => {} }]
  it('the ⋯ source menu: in the top layer, right-aligned 6px under its button, back out on close', () => {
    withPopover((shown) => {
      render(<SourceMenu label="More for eBird" items={items} />)
      const btn = screen.getByRole('button', { name: 'More for eBird' })
      box(btn, { left: 600, top: 300, width: 40, height: 40 })
      fireEvent.click(btn)
      const menu = screen.getByRole('menu', { hidden: true })
      expect(menu).toHaveAttribute('popover', 'manual')
      expect(shown).toContain(menu)
      expect(menu.style.position).toBe('fixed')
      expect(menu.style.top).toBe('346px')
      expect(menu.style.right).toBe(`${vw() - 640}px`)
      expect(menu).toHaveClass('eb-menu')
      fireEvent.keyDown(menu, { key: 'Escape' })
      expect(screen.queryByRole('menu', { hidden: true })).toBeNull()
      expect(btn).toHaveFocus()
    })
  })
  it('the ⋯ source menu without the popover API: fixed at its button all the same', () => {
    render(<SourceMenu label="More for eBird" items={items} />)
    const btn = screen.getByRole('button', { name: 'More for eBird' })
    box(btn, { left: 600, top: 300, width: 40, height: 40 })
    fireEvent.click(btn)
    const menu = screen.getByRole('menu', { name: 'More for eBird' })
    expect(menu).not.toHaveAttribute('popover')
    expect(menu.style.position).toBe('fixed')
    expect(menu.style.top).toBe('346px')
    expect(screen.getByRole('menuitem', { name: 'Refresh' })).toHaveFocus()
  })
  it('the "why?" popover: in the top layer, its left edge on the link\'s, 6px under it; closed, it leaves the top layer', () => {
    withPopover((shown) => {
      render(<SourceRow title="eBird life list" parts={['Imported 6 Nov']} counts={['160 species']} skipped={{ n: 7, body: <p>Seven entries</p> }} primary={null} />, { wrapper: withI18n('en') })
      const why = screen.getByRole('button', { name: 'Why 7 skipped?' })
      box(why, { left: 230, top: 400, width: 30, height: 20 })
      const pop = screen.getByTestId('not-counted')
      expect(pop).not.toHaveAttribute('popover') // as rendered on the server
      fireEvent.click(why)
      expect(pop).toHaveAttribute('popover', 'manual')
      expect(shown).toContain(pop)
      expect(pop.style.position).toBe('fixed')
      expect(pop.style.top).toBe('426px')
      expect(pop.style.right).toBe(`${vw() - 230}px`)
      expect(pop.style.maxHeight).toMatch(/^min\(260px, 50dvh, /)
      fireEvent.click(why)
      expect(pop).not.toHaveAttribute('popover')
      expect(pop).not.toBeVisible()
    })
  })
  it('the tour note: fixed 12px under its target, its left edge on the target\'s', async () => {
    vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => setTimeout(() => f(0), 0) as unknown as number)
    vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
    const main = document.createElement('main')
    main.className = 'eb-page-landing'
    main.innerHTML = '<section class="eb-view"><button data-tour="filter">Filters</button></section>'
    document.body.append(main)
    box(main.querySelector('button')!, { left: 40, top: 100, width: 100, height: 44 })
    render(<Tour onOwn={() => {}} onEnd={() => {}} />, { wrapper: withI18n('en') })
    await act(async () => { await new Promise((r) => setTimeout(r, 5)) })
    const note = screen.getByRole('dialog')
    expect(note.parentElement).toBe(document.body)
    expect(note.style.top).toBe('156px')
    expect(note.style.left).toBe('40px')
  })
})
