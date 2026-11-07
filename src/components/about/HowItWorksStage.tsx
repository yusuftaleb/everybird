'use client'
// The About page's "How it works" demo, as a Stageshow scene (src/components/about/stageshow, a subset of the kit).
// Started from the kit's `upload` gold example: a file on the desktop is carried into a browser window that runs off
// the right and bottom of the stage. What it draws is HowItWorksScene.tsx (shared with the static poster); this file
// is the script, loaded once the figure is in view (HowItWorksDemo), while the poster stands in.
//
// The story, one loop of about 17 s:
//   1. An eBird export sits on the desktop beside Everybird's Settings ("Your list"). It's dragged onto the eBird
//      rows, which ring in Accent as the real ones do; on the drop they read the rows ("Reading your file… 4,812 rows").
//   2. MyEBirdData is connected ("112 species · 3 skipped why? · Imported 6 Nov") and the summary line says "Your
//      collage has 112 species, all from eBird." with "See my collage"; pressed, the page swaps to the collage:
//      stickers arrive around the count as it rolls up to 112.
//   3. The Herons chip is pressed: the chips give way to the breadcrumb ("All birds / Herons / Herons, Egrets, and
//      Bitterns", an order with one family), the six herons glide and grow into the middle, the rest step out, the
//      count rolls to 6. "All birds" in the breadcrumb (the product's way back) brings everyone back.
//   4. Share: the share dialog opens on Story; Post, then Square, are pressed and the preview follows. Its ✕ closes
//      it; Settings in the top bar takes the window back to the start.
// On phones (compact) there is no desktop: "Add" on MyEBirdData, then "Choose your eBird file", instead of a drag; the
// orders are the "Choose an order" picker and its sheet.
//
// Smoothness (H1): everything that moves is a transform or an opacity on its own element (no height, grid or margin
// animation, one transform property per element so the compositor runs it); the drag image follows the cursor by a
// direct style write, not a React render per frame; the counters write text only when the number changes, inside
// contained boxes.
import { useEffect, useState } from 'react'
import { HERONS, TOTAL } from './how-it-works-data'
import { dragEnd, dragTo, initial, NO_GHOST, newDrag, poster, ROWS, Scene, type Drag, type S } from './HowItWorksScene'
import { Stage, type Act } from './stageshow'

/** Where the cursor rests between loops: below the file on the desktop (wide), low in the window's margin (compact). */
const REST = { wide: { x: 122, y: 92 }, compact: { x: 262, y: 336 } }

function makeScript(drag: Drag) {
  return async function script(a: Act<S>) {
    await a.wait(400)
    const wide = a.layout === 'wide'

    // 1. The eBird file arrives: carried in from the desktop (wide), or chosen (compact)
    if (wide) {
      a.mark('grab')
      const icon = a.rect('desk-icon')
      const file = a.rect('desk-file')
      const grab = { x: icon.x + icon.width / 2, y: icon.y + icon.height * 0.55 }
      await a.move(grab)
      await a.wait(200)
      const off = { x: grab.x - file.x, y: grab.y - file.y }
      drag.card = a.rect('drop')
      drag.cardEl = drag.el?.closest('.ss-stage')?.querySelector<HTMLElement>('[data-drop]') ?? null
      dragTo(drag, grab, off)
      // Shown during the press (the drag waits ~130 ms before it carries), so this render never lands mid-move
      a.put({ ghost: { on: true, dropped: false, off } })
      const card = drag.card
      await a.drag({ x: card.x + card.width * 0.55, y: card.y + card.height * 0.45 }, (at) => dragTo(drag, at, off), { duration: 1150, cursor: 'preserve' })
      a.mark('drop')
      dragEnd(drag)
      await a.set((s) => ({ ghost: { ...s.ghost, dropped: true }, reading: true }))
    } else {
      await a.move({ at: 'add-full', x: 0.6, y: 0.6 })
      await a.click()
      await a.set({ adding: true })
      await a.wait(450)
      await a.move({ at: 'choose', x: 0.62, y: 0.6 })
      await a.click()
      a.mark('drop')
      await a.set({ reading: true })
    }
    await a.wait(150)
    await a.set({ rows: ROWS })
    await a.wait(1050)

    // 2. Connected: the summary line and "See my collage"; the collage builds around the count
    a.mark('made')
    await a.set({ made: true, reading: false, adding: false, ghost: NO_GHOST })
    await a.wait(700)
    await a.move({ at: 'see', x: 0.5, y: 0.62 })
    await a.click()
    a.mark('collage')
    await a.set({ page: 'collage' })
    await a.wait(240)
    // The Settings page has faded out: put it back as it was before the import, out of sight
    await a.snap({ made: false, rows: 0 })
    await a.set({ birds: true, count: TOTAL })
    await a.wait(1800)

    // 3. Herons: the six glide into the middle; "All birds" in the breadcrumb brings everyone back
    if (wide) {
      await a.move({ at: 'herons', x: 0.62, y: 0.64 })
      await a.click()
    } else {
      await a.move({ at: 'picker', x: 0.5, y: 0.6 })
      await a.click()
      await a.set({ sheet: true })
      await a.wait(500)
      await a.move({ at: 'sheet-herons', x: 0.6, y: 0.62 })
      await a.click()
      await a.set({ sheet: false })
    }
    a.mark('herons')
    await a.set({ herons: true, count: HERONS.length })
    await a.wait(1100)
    await a.move({ at: 'all-birds', x: 0.72, y: 1.05 })
    await a.click()
    a.mark('all')
    await a.set({ herons: false, count: TOTAL })
    await a.wait(300)

    // 4. Share: the dialog opens on Story; Post and Square are pressed in turn; its ✕ closes it
    await a.move({ at: 'share', x: 0.7, y: 0.62 })
    await a.wait(120)
    await a.click()
    a.mark('share')
    await a.set({ share: 'story' })
    await a.wait(1000)
    await a.move({ at: 'fmt-post', x: 0.55, y: 0.6 })
    await a.click()
    await a.set({ share: 'post' })
    await a.wait(850)
    await a.move({ at: 'fmt-square', x: 0.55, y: 0.6 })
    await a.click()
    await a.set({ share: 'square' })
    await a.wait(1100)
    await a.move({ at: 'share-close', x: 0.5, y: 0.55 })
    await a.click()
    await a.set({ share: false })
    await a.wait(300)

    // Reset: Settings in the top bar takes the window back
    await a.move({ at: 'nav-settings', x: 0.74, y: 0.64 })
    await a.click()
    a.mark('reset')
    await a.set({ page: 'settings' })
    await a.wait(450)
    await a.snap({ birds: false, count: 0 })
    // Back to rest, where the next loop picks it up
    await a.move(REST[a.layout])
  }
}

// ---- The theme: the stage follows the site's light/dark switch ----

function useSiteTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  useEffect(() => {
    const html = document.documentElement
    const read = () => setTheme(html.dataset.theme === 'dark' ? 'dark' : 'light')
    read()
    const mo = new MutationObserver(read)
    mo.observe(html, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])
  return theme
}

export default function HowItWorksStage() {
  const theme = useSiteTheme()
  const [drag] = useState<Drag>(newDrag)
  const [script] = useState(() => makeScript(drag))
  return (
    <Stage<S>
      width={720}
      height={470}
      compact={{ below: 560, width: 358, height: 356 }}
      initial={initial}
      poster={poster}
      script={script}
      theme={theme}
      cursor={{ at: REST }}
      className="ebd"
    >
      {(s, _rect, layout) => <Scene s={s} layout={layout} drag={drag} />}
    </Stage>
  )
}
