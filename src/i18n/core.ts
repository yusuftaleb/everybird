// The message helpers, for server and client: `{name}` templates, `{one, few?, many?, other}` plurals and `<tag>chunk</tag>` markup.
// Messages are plain serializable data (src/i18n/messages/<lang>.ts); these turn them into text or nodes.
import { cloneElement, isValidElement, type ReactNode } from 'react'

/** A count's forms. With only `one` and `other`: `one` exactly when n = 1, `other` otherwise, in every language (not
 *  Intl.PluralRules: pt-BR's CLDR 'one' covers 0, which would read "0 espécie"). A language that needs more (Polish
 *  "2 gatunki" but "5 gatunków") adds `few` and `many`; then the form is the one Intl.PluralRules picks for the
 *  dictionary's language (`tagPlurals`), and `other` when the string lacks that form. */
export type Plural = { one: string; other: string; few?: string; many?: string }

/** `t` with each `{key}` replaced by `vars[key]`; a key `vars` doesn't have is left as written. */
export function fmt(t: string, vars?: Record<string, string | number>): string {
  if (!vars) return t
  return t.replace(/\{(\w+)\}/g, (all, k: string) => (Object.hasOwn(vars, k) ? String(vars[k]) : all))
}

/** Each tagged Plural's language. A dictionary's objects are tagged once (server.ts, I18nProvider), so callers pass no language. */
const LANG_OF = new WeakMap<object, string>()
const RULES = new Map<string, Intl.PluralRules>()

/** Tags every Plural in `node` (a dictionary or part of one) with `lang`, for `plural`'s `few` and `many`. */
export function tagPlurals(lang: string, node: unknown): void {
  if (!node || typeof node !== 'object') return
  const o = node as Record<string, unknown>
  if (typeof o.one === 'string' && typeof o.other === 'string') LANG_OF.set(o, lang)
  else for (const v of Object.values(o)) tagPlurals(lang, v)
}

function formOf(p: Plural, n: number): string {
  const lang = (p.few !== undefined || p.many !== undefined) && LANG_OF.get(p)
  if (!lang) return n === 1 ? p.one : p.other
  let rules = RULES.get(lang)
  if (!rules) RULES.set(lang, (rules = new Intl.PluralRules(lang)))
  return (p as Record<string, string | undefined>)[rules.select(n)] ?? p.other
}

/** The form of `p` for `n`, filled with `vars`. Pass the formatted number as `vars.n` ("1.089"); without it `{n}` is `n` as is. */
export function plural(p: Plural, n: number, vars?: Record<string, string | number>): string {
  return fmt(formOf(p, n), { n, ...vars })
}

const TAG = /<(\w+)>(.*?)<\/\1>/g

/**
 * `t` split into text and the nodes `tags` makes of each `<name>chunk</name>` ("Read <link>the guide</link>." ->
 * ['Read ', <a>the guide</a>, '.']). No nesting. A tag without a function stays as its plain chunk. Elements without a
 * key are given their index, so the array renders without React's key warning.
 */
export function rich(t: string, tags: Record<string, (chunk: string) => ReactNode>): ReactNode[] {
  const out: ReactNode[] = []
  let at = 0
  for (const m of t.matchAll(TAG)) {
    if (m.index > at) out.push(t.slice(at, m.index))
    const make = tags[m[1]]
    const node = make ? make(m[2]) : m[2]
    out.push(isValidElement(node) && node.key == null ? cloneElement(node, { key: out.length }) : node)
    at = m.index + m[0].length
  }
  if (at < t.length || out.length === 0) out.push(t.slice(at))
  return out
}

/** The placeholders of a template, sorted and each once: `{key}` for variables, `<tag>` for markup. */
export function placeholders(t: string): string[] {
  const found = new Set<string>()
  for (const m of t.matchAll(/\{(\w+)\}/g)) found.add(`{${m[1]}}`)
  for (const m of t.matchAll(/<(\w+)>/g)) found.add(`<${m[1]}>`)
  return [...found].sort()
}
