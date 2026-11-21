// Local bird names (Task 9). Written, not run: Yusuf tests the UI himself. Synthetic lists only; the expected names are
// read from the committed names files, so the spec follows the data.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { openAdd } from './add-birds'
import { nl } from '../src/i18n/messages/nl'
import { pt } from '../src/i18n/messages/pt'

const data = (f: string) => JSON.parse(readFileSync(resolve(__dirname, `../public/data/${f}`), 'utf8'))
const names = (l: string) => (data(`names.${l}.v1.json`) as { names: Record<string, string> }).names
const CODE = 'amerob'
const ENGLISH = (data('species.v1.json') as { species: { code: string; com: string }[] }).species.find((s) => s.code === CODE)!.com

/** A one-bird synthetic list (American Robin, first seen in `country`), stored where the app keeps it. */
async function seed(page: Page, country: string) {
  const saved = {
    v: 4,
    records: { ebird: [{ code: CODE, source: 'ebird', date: '2020-05-01', place: { country } }], 'ebird-list': [], inat: [], manual: [] },
    unmatched: [],
    edits: { removed: [], added: [], marks: {}, fixes: {} },
    rules: { hideHeard: false, hideDead: false, researchOnly: false },
    savedAt: new Date().toISOString(),
    name: '',
  };
  await page.goto('/about')
  await page.evaluate(
    (s) =>
      new Promise<void>((done, fail) => {
        const open = indexedDB.open('everybird')
        open.onupgradeneeded = () => open.result.createObjectStore('kv')
        open.onsuccess = () => {
          const tx = open.result.transaction('kv', 'readwrite')
          tx.objectStore('kv').put(s, 'everybird:v1')
          tx.oncomplete = () => done()
          tx.onerror = () => fail(tx.error)
        }
        open.onerror = () => fail(open.error)
      }),
    saved,
  )
}

test.describe('es-MX', () => {
  test.use({ locale: 'es-MX' })

  test('the card shows the es_MX name, and the dock search finds the bird by its English name', async ({ page }) => {
    await seed(page, 'CA')
    await page.goto('/')
    const local = names('es_MX')[CODE] ?? names('es')[CODE]
    const bird = page.locator(`[data-code="${CODE}"]`).first()
    await expect(bird).toHaveAttribute('aria-label', local)
    // Birds take no pointer events of their own (the stage hit-tests their silhouettes): open the card from the keyboard
    await bird.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: local })).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /buscar/i }).first().click()
    await page.getByRole('combobox').fill(ENGLISH.split(' ')[1].toLowerCase()) // "robin"
    await expect(page.getByRole('option', { name: new RegExp(local) })).toBeVisible()
  })

  test('the landing sample\'s tooltip is Spanish', async ({ page }) => {
    await page.goto('/')
    const stage = page.getByTestId('collage-stage')
    const first = stage.locator('[data-code]:not([data-off])').first()
    const code = await first.getAttribute('data-code')
    const label = await first.getAttribute('aria-label')
    expect(label).toBe(names('es')[code!] ?? label)
    // The stage hit-tests the silhouettes (a bird takes no pointer events itself): the mouse over the bird's middle
    await expect(stage).toHaveAttribute('data-settled', '')
    await first.scrollIntoViewIfNeeded()
    const bb = (await first.boundingBox())!
    await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
    await expect(page.getByTestId('bird-tip')).toContainText(names('es')[code!] ?? label!)
  })

  test('"Show bird names in English" shows English on the collage and survives a reload', async ({ page }) => {
    await seed(page, 'CA')
    await page.goto('/settings')
    await page.getByRole('switch', { name: /en inglés/i }).click()
    await page.goto('/')
    await expect(page.locator(`[data-code="${CODE}"]`).first()).toHaveAttribute('aria-label', ENGLISH)
    await page.reload()
    await expect(page.locator(`[data-code="${CODE}"]`).first()).toHaveAttribute('aria-label', ENGLISH)
  })
})

test.describe('pt-PT', () => {
  test.use({ locale: 'pt-PT' })

  test('the collage uses the pt_PT names', async ({ page }) => {
    await seed(page, 'CA')
    await page.goto('/')
    await expect(page.locator(`[data-code="${CODE}"]`).first()).toHaveAttribute('aria-label', names('pt_PT')[CODE] ?? ENGLISH)
  })
})

for (const [locale, ui, word, english] of [['pt-BR', pt.ui, 'pardal', 'sparrow'], ['nl-NL', nl.ui, 'huismus', 'sparrow']] as const) {
  test.describe(locale, () => {
    test.use({ locale })

    test(`Add by hand's search finds "${word}" and "${english}"`, async ({ page }) => {
      await page.goto('/settings')
      const dialog = await openAdd(page, 'hand', ui)
      const search = dialog.getByLabel(ui.tick.search, { exact: true })
      for (const q of [word, english]) {
        await search.fill(q)
        await expect(dialog.getByRole('listbox', { name: ui.tick.list }).getByRole('option').first()).toBeVisible()
      }
    })
  })
}
