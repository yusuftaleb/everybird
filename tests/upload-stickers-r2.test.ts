import { describe, expect, it } from 'vitest'
import { CACHE_CONTROL, CONTENT_TYPE, planUploads, signV4 } from '../scripts/deploy/upload-stickers-r2'

describe('signV4', () => {
  it("matches AWS's documented S3 example (GET Object with a Range header)", () => {
    const h = signV4(
      { method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/test.txt', headers: { range: 'bytes=0-9' } },
      { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1' },
      new Date('2013-05-24T00:00:00Z'),
    )
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, '
      + 'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, '
      + 'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    )
  })
})

describe('planUploads', () => {
  const local = [{ key: 'v1/128/a.webp', path: 'a', size: 10 }, { key: 'v1/128/b.webp', path: 'b', size: 20 }, { key: 'v1/384/a.webp', path: 'c', size: 30 }]
  it('skips files already in the bucket at the same size (resumable), uploads missing or changed ones', () => {
    const remote = new Map([['v1/128/a.webp', 10], ['v1/128/b.webp', 19]])
    expect(planUploads(local, remote).map((f) => f.key)).toEqual(['v1/128/b.webp', 'v1/384/a.webp'])
  })
  it('--force uploads everything', () => {
    expect(planUploads(local, new Map([['v1/128/a.webp', 10]]), true)).toHaveLength(3)
  })
  it('sends immutable year-long caching and the webp type', () => {
    expect(CACHE_CONTROL).toBe('public, max-age=31536000, immutable')
    expect(CONTENT_TYPE).toBe('image/webp')
  })
})
