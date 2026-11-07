import type { MetadataRoute } from 'next'

// The web manifest (/manifest.webmanifest). Icons: scripts/build-data/build-icons.ts (the origami bird on Paper).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Everybird',
    short_name: 'Everybird',
    description: 'A lifetime of birds, as a sticker collage.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f6f4ef',
    theme_color: '#f6f4ef',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  }
}
