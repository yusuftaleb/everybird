import { expect, it } from 'vitest'
import { PRINT, PRINT_FROM, STICKER_BASE, cardFallback, cardSrcSet, printStickerUrl, stickerPath } from '../src/lib/sticker-url'

it('selects print tiers by device pixels and preserves versions in the fallback', () => {
  expect(PRINT).toBe(1024)
  expect(PRINT_FROM).toBe(440)
  expect(stickerPath('crowa', PRINT, 'd79c59489f')).toBe('v1/1024/crowa.d79c59489f.webp')
  for (const [px, size] of [[1, 128], [128, 128], [129, 384], [440, 384]]) {
    expect(printStickerUrl('crowa', px)).toEqual({ url: `${STICKER_BASE}/v1/${size}/crowa.webp`, fallback: null })
  }
  expect(printStickerUrl('crowa', 441, 'ab12')).toEqual({ url: `${STICKER_BASE}/v1/1024/crowa.ab12.webp`, fallback: `${STICKER_BASE}/v1/384/crowa.ab12.webp` })
})

it('the card takes the 384 and 1024 files by density, and falls back from a failed 1024 to the 384 once', () => {
  const b = STICKER_BASE
  expect(cardSrcSet('crowa')).toEqual({ src: `${b}/v1/384/crowa.webp`, srcSet: `${b}/v1/384/crowa.webp 384w, ${b}/v1/1024/crowa.webp 1024w` })
  expect(cardSrcSet('crowa', 'ab12').srcSet).toBe(`${b}/v1/384/crowa.ab12.webp 384w, ${b}/v1/1024/crowa.ab12.webp 1024w`)
  expect(cardFallback(`${b}/v1/1024/crowa.ab12.webp`, 'crowa', 'ab12')).toBe(`${b}/v1/384/crowa.ab12.webp`)
  expect(cardFallback(`${b}/v1/384/crowa.ab12.webp`, 'crowa', 'ab12')).toBeNull()
  expect(cardFallback('', 'crowa')).toBeNull()
})
