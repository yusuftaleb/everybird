# Share Dialog: Latest Lifer Switch and Buy Me a Coffee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Show latest lifer" switch in the share dialog (on by default; off drops the latest-lifer row from the image and gives its room to the collage), and a quiet Buy Me a Coffee link in the site footer, on About and in the share dialog, never on the images.

**Architecture:** `drawShareImage` takes a new `latest?: boolean` option (default `true`); with `false` it leaves the row out of `CardContent`, and `cardLayout` already extends the collage down to the hairline when `latest` is false. The dialog keeps a per-session `showLatest` state, adds it to its render key and to its pack cache key (the collage frame's aspect changes, so the pack must too). One constant, `COFFEE_URL` in `src/lib/site-meta.ts`, feeds three plain text links (footer, About credits, dialog). About's "How it works" scene mirrors the new switch in its wide share dialog.

**Tech Stack:** Next.js app router, React, canvas 2D (`src/lib/share/image.ts`), Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/plans/2026-11-15-next-features.md`, item "2. Share dialog: latest lifer switch and Buy Me a Coffee" (approved by Yusuf). Read `AGENTS.md`, `DESIGN.md` ("Switches", "Share image", the footer under "Headroom", "Voice and copy") first.

**Branch:** stacked on `feat/nf-4-date-stamp` (item 4). Start only once item 4's work is committed there (it is still editing `e2e/share.spec.ts`, then `src/components/about/*`, `AGENTS.md`, `DESIGN.md`); rebase onto its final commit before Task 1 and keep its "As of …" footer line and its `date stamp` e2e block untouched.

## Global Constraints

- "Show latest lifer" switch in the share dialog, on by default. Off removes the latest-lifer line from the image.
- Buy Me a Coffee link, https://buymeacoffee.com/yusuftaleb, in the footer, on About, and in the share dialog.
- Never on the share images themselves. Quiet styling, no pop-ups or nags.
- The share image's footer line, `FOOTER_LINE` and item 4's stamp stay as they are; the sticker credit rules in `AGENTS.md` are unchanged.
- Every control takes a 44px press and no page or dialog scrolls sideways (`e2e/flows.spec.ts` `pressAreas`).
- Ports 3000/3001 are Yusuf's: e2e uses 3100/3200/4100 only. No push, deploy or posting.

**Decisions (builder's calls, made here):**
- Switch label exactly "Show latest lifer"; `role="switch"`, `aria-checked`, the site's switch (`.eb-switch` + `.eb-track`/`.eb-knob` from `collage.css`, as the dock's True size), full opacity in the dialog. Placed between "Collage title" and the action buttons (both are "what's on the image").
- Shown only when the current view has a latest lifer (some shown entry has a date; the dialog's existing `hasLatest`). With no dated bird the image has no row, so a switch would do nothing.
- Remembered per dialog session only: every open starts on, like the title edits that stay in that share. Not stored, not in `Saved`, not in backups.
- Links and link previews are unchanged: the switch is for the image only (`makeShareLink` and `opengraph-image.tsx` untouched).
- No analytics event for the switch or the coffee link (the Worker's allow-list would need a deploy).
- Coffee link: plain text, no logo, no icon, no brand colour; `target="_blank" rel="noopener noreferrer"` like the footer's GitHub link and About's links. Wording "Buy me a coffee" in the footer and dialog; on About a sentence in the Credits section after the "Made by Yusuf Taleb" paragraph: "If you enjoy Everybird, you can buy Yusuf a coffee." (link on "buy Yusuf a coffee"; About speaks of Yusuf in the third person).
- Footer order: All credits, Made by Yusuf Taleb, Buy me a coffee, then the GitHub glyph at the row's right edge. Dialog: the last line of the controls column, after the link note, in `.eb-note` (14px Muted), link colour inherited, underlined.
- About scene: the wide design's share dialog gets a static "Show latest lifer" switch, on (the compact design hides it, as it hides the title field: no room). No coffee line in the scene (the scene already leaves out the dialog's notes).

## Review Focus

1. Toggling the switch while a render is in flight, or flipping it twice fast: the preview, Share image and Download must end on the image for the switch's current state, never a stale one (Task 1: the key includes the switch; the dialog test checks Download is disabled until the new render lands).
2. A view with no dated birds (hand ticks without a date, an old import): no switch, and the image is as today (Task 1 test).
3. Toggling off then on again must reuse the first pack, not re-pack or reuse the wrong frame's pack (Task 1: `packForImage` call count and spec).
4. The dialog on a 390px phone growing taller with two more rows: still no sideways scroll, every control 44px (Task 1 extends `share.spec.ts`'s no-sideways test to the switch; `flows.spec.ts` covers 44px).
5. The footer at 320px and at Safari's 260px text-size width: the third link wraps but the GitHub glyph still ends the last line (Task 2: the existing `rightGap` check now runs with the coffee link in the row; `text-size.spec.ts` runs unchanged).

---

### Task 1: The switch, end to end

**Files:**
- Modify: `src/lib/share/image.ts` (`ShareImageOpts`, `drawShareImage`, the `imagePackSpec` comment)
- Modify: `src/components/share/ShareDialog.tsx`, `src/components/share/share.css`
- Test: `tests/share-image.test.ts`, `tests/share-dialog.test.tsx`, `e2e/share.spec.ts`

**Interfaces:**
- Produces (`image.ts`): `ShareImageOpts.latest?: boolean` — "the latest lifer row; default true. False leaves it out and gives its room to the collage (cardLayout's `latest: false`)". In `drawShareImage`: `const latest = opts.latest !== false && latestRow ? latestText(…) : undefined` (everything downstream already keys off `latest`/`L.latest`).
- Produces (`ShareDialog.tsx`): state `const [showLatest, setShowLatest] = useState(true)`; `const withLatest = hasLatest && showLatest`; `packFor(f: ImageFormat, named: boolean, lifer: boolean)` keyed `` `${f}|${named}|${lifer}` `` with `imagePackSpec(f, { name: named, filter: !!label, latest: lifer, count: shown.length })`; render key `` `${format}|${trimmed}|${theme}|${withLatest}` ``; `renderShareImage({ …, latest: withLatest })`.

- [ ] **Step 1: Write the failing tests**

`tests/share-image.test.ts`, in `describe('cardLayout')`:

```ts
it('without the latest lifer row, the collage reaches down to the hairline gap (the row\'s room goes to the birds)', () => {
  for (const format of ['story', 'post', 'square'] as const) {
    const on = cardLayout(format, { name: true, filter: false, latest: true, count: 197 })
    const off = cardLayout(format, { name: true, filter: false, latest: false, count: 197 })
    expect(off.collage.y).toBe(on.collage.y)
    expect(off.rule.y).toBe(on.rule.y)
    expect(off.collage.h - on.collage.h).toBe(on.rule.y - on.latest!.y) // the row's icon and its gap to the rule
    expect(packSpec(off).aspect).toBeLessThan(packSpec(on).aspect) // taller frame, so a new pack
  }
})
```

`tests/share-dialog.test.tsx`, new tests (the module mock already stubs `packForImage` and `renderShareImage`; import `imagePackSpec` from the real module via `orig`, or call it from the mocked module, which spreads the original):

```ts
it('"Show latest lifer" is a switch, on by default; off re-renders without the row, packed for the taller collage', async () => {
  const image = await import('@/lib/share/image')
  render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
  const sw = screen.getByRole('switch', { name: 'Show latest lifer' })
  expect(sw).toHaveAttribute('aria-checked', 'true')
  await waitFor(() => expect(renders).toHaveLength(1))
  expect(vi.mocked(image.renderShareImage).mock.calls[0][0].latest).toBe(true)
  await act(async () => renders[0].resolve(new Blob(['on'], { type: 'image/png' })))
  const dl = screen.getByRole('button', { name: 'Download image' }) as HTMLButtonElement
  await waitFor(() => expect(dl.disabled).toBe(false))
  fireEvent.click(sw)
  expect(sw).toHaveAttribute('aria-checked', 'false')
  expect(dl.disabled).toBe(true) // the old image is never downloaded for the new state
  await waitFor(() => expect(renders).toHaveLength(2))
  expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)![0].latest).toBe(false)
  expect(vi.mocked(image.packForImage).mock.calls.at(-1)![2]).toEqual(
    image.imagePackSpec('story', { name: false, filter: false, latest: false, count: 1 }))
})

it('turning the switch back on reuses the first pack', async () => {
  const image = await import('@/lib/share/image')
  vi.mocked(image.packForImage).mockClear()
  render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
  await waitFor(() => expect(renders).toHaveLength(1))
  const sw = screen.getByRole('switch', { name: 'Show latest lifer' })
  fireEvent.click(sw)
  await waitFor(() => expect(renders).toHaveLength(2))
  fireEvent.click(sw)
  await waitFor(() => expect(renders).toHaveLength(3))
  expect(vi.mocked(image.packForImage)).toHaveBeenCalledTimes(2)
})

it('with no dated bird in view there is no latest lifer, so no switch', () => {
  render(<ShareDialog state={stateWith([{ ...entry('ostric2'), date: undefined }])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
  expect(screen.queryByRole('switch', { name: 'Show latest lifer' })).toBeNull()
})

it('each open starts with the switch on', () => {
  const { unmount } = render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
  fireEvent.click(screen.getByRole('switch', { name: 'Show latest lifer' }))
  unmount()
  render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
  expect(screen.getByRole('switch', { name: 'Show latest lifer' })).toHaveAttribute('aria-checked', 'true')
})
```

Add `vi.mocked(image.packForImage).mockClear(); vi.mocked(image.renderShareImage).mockClear()` to the file's `beforeEach` (import the mocked module at the top), so `mock.calls[0]` is this test's first call. Renders after the first are debounced by `RENDER_DELAY_MS` (250 ms); `waitFor`'s default 1 s covers it.

`e2e/share.spec.ts`, a new test after the `date stamp` block, reusing item 4's `fillText` recorder pattern (Chromium, WebKit and Firefox all run `share.spec.ts`'s non-`chromiumOnly` tests; this one needs no clipboard or share sheet):

```ts
test("Show latest lifer: on by default; off draws no latest lifer row, on draws it again", async ({ page }) => {
  test.setTimeout(90_000)
  await page.addInitScript(/* the same CanvasRenderingContext2D.prototype.fillText wrapper into window.__fillTexts */)
  const dialog = await openShare(page)
  const preview = dialog.getByTestId("share-preview")
  const texts = () => page.evaluate(() => (window as unknown as { __fillTexts: string[] }).__fillTexts)
  const clear = () => page.evaluate(() => { (window as unknown as { __fillTexts: string[] }).__fillTexts = [] })
  const sw = dialog.getByRole("switch", { name: "Show latest lifer" })
  await expect(sw).toHaveAttribute("aria-checked", "true")
  await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 })
  expect((await texts()).some((t) => t.startsWith("LATEST LIFER"))).toBe(true)
  await clear()
  await sw.click()
  await expect(sw).toHaveAttribute("aria-checked", "false")
  await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 })
  const off = await texts()
  expect(off.length).toBeGreaterThan(0) // a new image was drawn
  expect(off.some((t) => t.startsWith("LATEST LIFER"))).toBe(false)
  expect(off.some((t) => t.startsWith("everybird.yusuftaleb.com · stickers by huashu"))).toBe(true) // the footer and credit stay
  await clear()
  await sw.click()
  await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 })
  expect((await texts()).some((t) => t.startsWith("LATEST LIFER"))).toBe(true)
})
```

In the existing "the dialog never scrolls sideways …" test, also check the switch's column: inside its `dialog.evaluate`, add `swOver: d.querySelector('[role="switch"]')!.getBoundingClientRect().right - col.right` and `expect(m.swOver).toBeLessThanOrEqual(0.5)`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/share-image.test.ts tests/share-dialog.test.tsx`
Expected: the cardLayout test passes already (it pins today's behaviour); the four dialog tests FAIL (no switch named "Show latest lifer").

- [ ] **Step 3: Implement**

- `image.ts`: the `latest` option as in Interfaces; update the file header ("bottom … the latest lifer row (unless the dialog's switch is off) …") and `imagePackSpec`'s comment ("once per format, name-or-not and lifer-or-not").
- `ShareDialog.tsx`: state, `withLatest`, `packFor` third argument and key, render key and `latest` passed to `renderShareImage`, effect deps (`withLatest`). Update the pack comment ("one pack per format, name-or-not and lifer-or-not") and the file header (the switch). Markup, after the `.eb-share-field` div, only when `hasLatest`:
  `<button type="button" role="switch" aria-checked={showLatest} className="eb-switch eb-share-switch" onClick={() => setShowLatest((v) => !v)}><span>Show latest lifer</span><span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span></button>`
  and `import '@/components/collage/collage.css'` (where `.eb-switch`, `.eb-track`, `.eb-knob` live; `RulesSwitches.tsx` imports it the same way).
- `share.css`: `.eb-share-switch { align-self: flex-start; opacity: 1; padding: 0; gap: 12px; font-weight: 500; }` (`.eb-switch` already gives 44px min height and the on-state colours); add `.eb-share-switch` to the reduced-motion block's `transition: none` with `.eb-share-switch .eb-track, .eb-share-switch .eb-knob`. Keep the focus ring from `.eb-share button:focus-visible`.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/share-image.test.ts tests/share-dialog.test.tsx`
Expected: PASS
Run: `STICKERS_DIR=../everybird-stickers npx playwright test e2e/share.spec.ts --project=chromium --project=webkit`
Expected: PASS (item 4's tests included)

- [ ] **Step 5: Commit**

```bash
git add src/lib/share/image.ts src/components/share/ShareDialog.tsx src/components/share/share.css tests/share-image.test.ts tests/share-dialog.test.tsx e2e/share.spec.ts
git commit -m "feat(share): Show latest lifer switch in the share dialog"
```

---

### Task 2: Buy Me a Coffee in the footer, on About and in the share dialog

**Files:**
- Modify: `src/lib/site-meta.ts`, `src/components/app/SiteFooter.tsx`, `app/(app)/about/page.tsx`, `src/components/share/ShareDialog.tsx`, `src/components/share/share.css`
- Test: `tests/app-routes.test.tsx`, `tests/share-dialog.test.tsx`, `e2e/about.spec.ts`

**Interfaces:**
- Produces (`src/lib/site-meta.ts`): `export const COFFEE_URL = 'https://buymeacoffee.com/yusuftaleb'` (`site-meta.ts` has only a type import from Next, so the client dialog can import it).

- [ ] **Step 1: Write the failing tests**

`tests/app-routes.test.tsx`, in the landing test's footer block:

```ts
const coffee = within(footer).getByRole('link', { name: 'Buy me a coffee' })
expect(coffee).toHaveAttribute('href', 'https://buymeacoffee.com/yusuftaleb')
expect(coffee).toHaveAttribute('target', '_blank')
expect(coffee).toHaveAttribute('rel', 'noopener noreferrer')
```

`tests/share-dialog.test.tsx`:

```ts
it('ends with a quiet Buy me a coffee link (a plain link, new tab), never part of the image', () => {
  render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
  const link = screen.getByRole('link', { name: 'Buy me a coffee' })
  expect(link).toHaveAttribute('href', 'https://buymeacoffee.com/yusuftaleb')
  expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  expect(link.querySelector('img, svg')).toBeNull()
})
```

and a source check that nothing draws it: `expect(readFileSync('src/lib/share/image.ts', 'utf8')).not.toMatch(/coffee/i)`.

`e2e/about.spec.ts`: in the four-page footer loop (collage, settings, about, shared view), after "Made by Yusuf Taleb":

```ts
const coffee = footer.getByRole("link", { name: "Buy me a coffee" })
await expect(coffee).toHaveAttribute("href", "https://buymeacoffee.com/yusuftaleb")
await expect(coffee).toHaveAttribute("target", "_blank")
await expect(coffee).toHaveAttribute("rel", "noopener noreferrer")
```

(the existing `rightGap < 1` check then proves the GitHub glyph still ends the row). In the "/about says what Everybird is …" test:

```ts
await expect(credits.getByRole("link", { name: "buy Yusuf a coffee" })).toHaveAttribute("href", "https://buymeacoffee.com/yusuftaleb")
await expect(credits.getByText(/If you enjoy Everybird, you can buy Yusuf a coffee\./)).toBeVisible()
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/app-routes.test.tsx tests/share-dialog.test.tsx`
Expected: FAIL, no link named "Buy me a coffee".

- [ ] **Step 3: Implement**

- `SiteFooter.tsx`: `<p className="eb-mono"><a href={COFFEE_URL} target="_blank" rel="noopener noreferrer">Buy me a coffee</a></p>` after "Made by Yusuf Taleb"; update the component comment (the maker, a way to support him, the code). No CSS change: `.eb-footer a` already styles it.
- `about/page.tsx`: a new `<p className="eb-prose">If you enjoy Everybird, you can <A href={COFFEE_URL}>buy Yusuf a coffee</A>.</p>` right after the "Made by …" paragraph in `#credits`.
- `ShareDialog.tsx`: the last child of `.eb-share-controls`, after the link note: `<p className="eb-note eb-share-coffee"><a href={COFFEE_URL} target="_blank" rel="noopener noreferrer">Buy me a coffee</a></p>`.
- `share.css`: `.eb-share-coffee a { color: inherit; text-underline-offset: 3px; }`.

The links sit inline in `<p>`, so `flows.spec.ts`'s 44px rule exempts them as inline text links (WCAG 2.5.8), as it does the footer's other links.

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/app-routes.test.tsx tests/share-dialog.test.tsx`
Expected: PASS
Run: `STICKERS_DIR=../everybird-stickers npx playwright test e2e/about.spec.ts --project=chromium --project=webkit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/site-meta.ts src/components/app/SiteFooter.tsx "app/(app)/about/page.tsx" src/components/share/ShareDialog.tsx src/components/share/share.css tests/app-routes.test.tsx tests/share-dialog.test.tsx e2e/about.spec.ts
git commit -m "feat: Buy me a coffee link in the footer, on About and in the share dialog"
```

---

### Task 3: About's "How it works" scene mirrors the switch

**Files:**
- Modify: `src/components/about/HowItWorksScene.tsx` (the scene's `ShareDialog`), `src/components/about/how-it-works.css`
- Test: `e2e/about.spec.ts` ("How it works: the scene's labels are the product's …")

- [ ] **Step 1: Write the failing test**

In the scene-labels test, after the format checks:

```ts
await expect(scene.locator(".ebd-share-switch")).toHaveText("Show latest lifer")
await expect(scene.locator(".ebd-share-switch")).toHaveAttribute("data-on", "")
expect(src("src/components/share/ShareDialog.tsx")).toContain("<span>Show latest lifer</span>")
await expect(page.locator('[data-poster="compact"] .ebd-share-switch')).toBeHidden() // no room in the compact design, as the title field
// The dialog still fits inside the stage
const fit = await scene.evaluate((s) => {
  const d = s.querySelector(".ebd-share")!.getBoundingClientRect(), st = s.getBoundingClientRect()
  return st.bottom - d.bottom
})
expect(fit).toBeGreaterThanOrEqual(0)
```

(The poster renders the share dialog with opacity 0; `toHaveText` and the bounding box still work on it. If `.ebd-share` measures as transformed, compare against its untransformed height via `offsetTop + offsetHeight` in the stage's coordinates.)

- [ ] **Step 2: Run it to see it fail**

Run: `STICKERS_DIR=../everybird-stickers npx playwright test e2e/about.spec.ts --project=chromium -g "scene's labels"`
Expected: FAIL, `.ebd-share-switch` not found.

- [ ] **Step 3: Implement**

In the scene's `ShareDialog`, between `.ebd-share-field` and `.ebd-share-actions`: `<span className="ebd-share-switch" data-on=""><span>Show latest lifer</span><span className="ebd-track"><span className="ebd-knob" /></span></span>`. In `how-it-works.css`: `.ebd .ebd-share-switch { display: inline-flex; align-items: center; gap: 8px; align-self: flex-start; height: 22px; font-size: 12px; font-weight: 500; }`, the on state (`.ebd .ebd-share-switch[data-on] .ebd-track { background: var(--accent); box-shadow: inset 0 0 0 1px var(--accent) }`, knob `translateX(10px)`, `background: var(--paper)`; reuse the dock's `.ebd-track`/`.ebd-knob`, and the dock's on-state rule if one exists), and `.ebd .ss-stage[data-layout="compact"] .ebd-share-switch { display: none; }`. Mention the switch in the scene's header comment and `REHEARSAL.md`'s share step if it lists the dialog's controls. No change to `how-it-works-data.ts` (the images keep their latest lifer row; `tests/howto-data.test.ts` stays green).

- [ ] **Step 4: Run it to see it pass**

Run: `STICKERS_DIR=../everybird-stickers npx playwright test e2e/about.spec.ts --project=chromium --project=webkit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/about/HowItWorksScene.tsx src/components/about/how-it-works.css src/components/about/REHEARSAL.md e2e/about.spec.ts
git commit -m "feat(about): the How it works share dialog shows the Show latest lifer switch"
```

---

### Task 4: Docs and full verification

**Files:**
- Modify: `AGENTS.md`, `DESIGN.md`

- [ ] **Step 1: Update `AGENTS.md`**

- Structure > `src/components/share/ShareDialog.tsx`: add the "Show latest lifer" switch (on each open, only when the view has a latest lifer, off drops the row and the collage takes its room; packs kept per format, name-or-not and lifer-or-not; image only, links and previews unchanged) and the closing "Buy me a coffee" line.
- `SiteFooter`: "All credits", "Made by Yusuf Taleb", "Buy me a coffee" (`COFFEE_URL` in `site-meta.ts`, new tab), then the GitHub link.
- About (`app/(app)/about/page.tsx`): the credits' coffee sentence. About demo: the wide scene's switch.
- Rules: add one line, "Buy Me a Coffee (`COFFEE_URL`) appears only as plain text links in the footer, About and the share dialog; never on share images or link previews, no pop-ups."

- [ ] **Step 2: Update `DESIGN.md`**

- "Switches": the share dialog's inline switch (`.eb-switch` at full opacity, label 16/500 beside the track, 44px).
- "Share image": the latest lifer row is optional ("Show latest lifer", on by default); without it the collage reaches the hairline gap.
- The footer sentence under "Headroom": the coffee link after "Made by Yusuf Taleb" (and fix "mono credit line", which no longer exists).
- "Do"/"Don't": the coffee link is a quiet text link (footer, About, share dialog), never on images, no prompts or pop-ups.

- [ ] **Step 3: Verify**

Run each; all must pass:

```bash
npm run lint
npx next typegen && npx tsc --noEmit
npm test
STICKERS_DIR=../everybird-stickers npx playwright test e2e/share.spec.ts e2e/about.spec.ts e2e/flows.spec.ts --project=chromium --project=webkit
STICKERS_DIR=../everybird-stickers npx playwright test e2e/text-size.spec.ts e2e/settings.spec.ts --project=chromium
```

(`flows.spec.ts` checks the share dialog and every page for 44px presses and no sideways scroll; `text-size.spec.ts` the footer at 195 and 260px.) Look at the dialog once at 390 and 1280 in both themes: `SHOT_DIR=<scratch dir outside the repo> npx playwright test e2e/share.spec.ts --project=chromium -g "never scrolls sideways"`.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md DESIGN.md
git commit -m "docs: share dialog switch and Buy me a coffee in AGENTS.md and DESIGN.md"
```

## Questions for Yusuf

1. Wording: "Buy me a coffee" in the footer and dialog, and on About "If you enjoy Everybird, you can buy Yusuf a coffee." OK, or one wording everywhere?
2. Plain text link with no BMC logo or coffee icon: OK?
3. In the share dialog: a bare link as the last line under the link note, or a short lead-in (for example "Everybird is free.")?
4. The switch is hidden when the view has no dated bird (no latest lifer to show), rather than shown disabled: OK?
5. The switch resets to on at every open (not remembered): OK, or remember it per device like the theme?
6. About's demo shows the switch (on) in its wide design only: OK, or leave the demo as it is?

---

## Addendum: Yusuf's feedback on the preview (`2026-11-15-feedback-1.md`, binding)

### Task 5: Larger preview, no link note, the Buy Me a Coffee button on About

**Files:** `src/components/share/ShareDialog.tsx`, `src/components/share/share.css`, `app/(app)/about/page.tsx` (+ `about.css`), `public/` (the button image), tests (`tests/share-dialog.test.tsx`, `e2e/share.spec.ts`, `e2e/about.spec.ts`, `e2e/flows.spec.ts` if the dialog's 44px/no-sideways checks need it), `AGENTS.md`, `DESIGN.md`.

1. **Larger preview.** The share dialog's preview (left column) must fill much more of the dialog, especially Story 9:16 (no wide grey bands either side), on desktop and phone, within DESIGN.md (tokens, radii, spacing, the dialog's existing structure and motion). Size the preview by the available height and the format's aspect (e.g. the dialog grows to most of the viewport height on desktop; the preview box takes the image's own aspect instead of a fixed square/column with letterboxing), keeping the controls column usable and the dialog never scrolling sideways at 320–440 px, 768, 1280, 1440. If two layouts are genuinely different (e.g. a: preview fills the dialog's height, controls beside it; b: a wider dialog with the preview at a larger fixed width; or a phone layout with the preview full-width on top), build them as preview variants with key `sharepv` via `useVariant('sharepv', ['a','b'])` (src/lib/variants.ts), default a = your recommendation, and list them in AGENTS.md's "Preview variants" paragraph. Otherwise one layout.
2. **Remove the note** "The link opens your whole collage, with first months and regions, never towns or coordinates." from the share dialog only (keep any privacy explanation on About). Update tests that assert it.
3. **About's coffee link becomes Buy Me a Coffee's standard static button image** (the middle option), linking to `COFFEE_URL` (https://buymeacoffee.com/yusuftaleb), `target="_blank" rel="noopener noreferrer"`. Self-host the official static image (download Buy Me a Coffee's standard button image once, e.g. https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png, into `public/` with a clear name; record its source URL in a comment and in About's credits only if their terms ask for it). No widget, no script, no cookies, nothing loaded from a third party. Modest size (about 36–40px tall, width by its aspect), `alt="Buy me a coffee"`, explicit width/height to avoid layout shift, a 44px press area, the site's focus ring. It sits where the sentence is now (credits, after "Made by Yusuf Taleb"); keep or shorten the lead-in sentence so it reads naturally ("If you enjoy Everybird, you can buy Yusuf a coffee." then the button, or the button alone — your call, record it). Works in light and dark (the yellow button on both Paper themes). The footer's and the share dialog's plain "Buy me a coffee" text links stay exactly as they are.
4. Tests first where they fit; then lint, `npx next typegen && npx tsc --noEmit`, `npm test`. Docs: AGENTS.md (share dialog, About), DESIGN.md (share dialog preview sizing; the one third-party brand image on About as a documented exception, like the Red List colours will be).
