// No English left in the components: every JSX text with a word, and every aria-label, title, placeholder or alt
// written as a literal (or a template's literal parts), must come from the strings files (src/i18n/messages). Read
// with TypeScript's parser, so generics and comparisons never look like markup. A later task adds its directory to
// SCOPES (Task 5 `src/components/import`, Task 7 `src/components/share`, Task 10 `src/components/about`) and takes
// its files off SKIP.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '..')

/** The directories scanned (every .tsx under them). */
export const SCOPES = ['src/components/app', 'src/components/collage', 'src/components/filters', 'src/components/edit', 'src/components/import', 'src/components/share', 'src/components/about', 'app']

/** Files in a scope that another task translates, or that stay English, each with why. */
export const SKIP: Record<string, string> = {
  'app/global-not-found.tsx': 'English by design: no route, so no language (its own document)',
}

/** Texts that are the same in every language: names and glyphs. */
export const ALLOW = new Set<string>([
  'Everybird', 'iNaturalist',
  // About's credits: the names of what Everybird is built from, and the Buy Me a Coffee button's own words (its image is English).
  'Yusuf Taleb', 'huashu-bird-sticker', 'Avian Visitors', 'AVONET', 'BIRDBASE', 'Natural Earth', 'Debian iso-codes', 'Fontshare', 'Geist Mono',
  'flag-icons', 'AviList', 'AvesData', 'Phosphor', 'Icons8', 'Buy me a coffee', 'MyEBirdData', 'CSV',
])

const ATTRS = new Set(['aria-label', 'title', 'placeholder', 'alt'])
const WORD = /\p{L}{2,}/u

export type Literal = { file: string; line: number; kind: 'text' | string; text: string }

/** Every .tsx file under `dir` (relative to the repo), stageshow/ left out. */
export function tsxFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const name of readdirSync(resolve(ROOT, d))) {
      const rel = join(d, name)
      if (name === 'stageshow' || name === 'node_modules') continue
      if (statSync(resolve(ROOT, rel)).isDirectory()) walk(rel)
      else if (rel.endsWith('.tsx')) out.push(rel)
    }
  }
  walk(dir)
  return out.sort()
}

/** The literal UI text in one file's source: JSX text nodes with a word, and literal aria-label/title/placeholder/alt. */
export function scanLiterals(file: string, source = readFileSync(resolve(ROOT, file), 'utf8')): Literal[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const out: Literal[] = []
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
  const add = (n: ts.Node, kind: string, raw: string) => {
    const text = raw.replace(/\s+/g, ' ').trim()
    if (WORD.test(text) && !ALLOW.has(text)) out.push({ file, line: at(n), kind, text })
  }
  /** A value's literal parts: a string, a template's static chunks, both arms of a ternary. */
  const literalParts = (e: ts.Expression | undefined, kind: string, node: ts.Node) => {
    if (!e) return
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) add(node, kind, e.text)
    else if (ts.isTemplateExpression(e)) {
      add(node, kind, e.head.text)
      for (const s of e.templateSpans) add(node, kind, s.literal.text)
    } else if (ts.isConditionalExpression(e)) {
      literalParts(e.whenTrue, kind, node)
      literalParts(e.whenFalse, kind, node)
    } else if (ts.isParenthesizedExpression(e)) literalParts(e.expression, kind, node)
  }
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n)) add(n, 'text', n.text)
    else if (ts.isJsxExpression(n) && n.expression && (ts.isJsxElement(n.parent) || ts.isJsxFragment(n.parent))) {
      // {'literal'} or {cond ? 'a' : 'b'} as a child
      literalParts(n.expression, 'text', n)
    } else if (ts.isJsxAttribute(n)) {
      const name = n.name.getText(sf)
      if (ATTRS.has(name) && n.initializer) {
        if (ts.isStringLiteral(n.initializer)) add(n, name, n.initializer.text)
        else if (ts.isJsxExpression(n.initializer)) literalParts(n.initializer.expression, name, n)
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return out
}

describe('the literals scanner', () => {
  it('finds JSX text, literal attributes, template parts and ternary arms; skips code and allowed names', () => {
    const src = `
      const a = <p className="x">Hello there <b>{name}</b></p>
      const b = <button aria-label="Close" title={\`Size by \${x}\`} placeholder={on ? 'Find a bird' : t.x}>{'Undo'}</button>
      const c = new Map<string, number>(); const d = x < y && y > z
      const e = <span aria-hidden="true">·</span>
      const f = <i>Everybird</i>
    `
    const hits = scanLiterals('x.tsx', src).map((h) => `${h.kind}:${h.text}`)
    expect(hits).toEqual(['text:Hello there', 'aria-label:Close', 'title:Size by', 'placeholder:Find a bird', 'text:Undo'])
  })
})

describe('no literal UI text', () => {
  for (const scope of SCOPES) {
    it(`${scope}: every string comes from the strings files`, () => {
      const found = tsxFiles(scope)
        .filter((f) => !(f in SKIP))
        .flatMap((f) => scanLiterals(f))
        .map((h) => `${relative('.', h.file)}:${h.line} ${h.kind} "${h.text}"`)
      expect(found).toEqual([])
    })
  }
  it('every skipped file exists (so a skip never outlives its file)', () => {
    for (const f of Object.keys(SKIP)) expect(statSync(resolve(ROOT, f)).isFile(), f).toBe(true)
  })
})
