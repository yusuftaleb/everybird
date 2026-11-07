import type { Metadata } from 'next'

// The origami bird on a Paper tile (scripts/build-data/build-icons.ts); the dark tile for a dark browser theme.
// Declared here rather than as app/ icon files so the dark variant can carry its media query.
export const SITE_ICONS: NonNullable<Metadata['icons']> = {
  icon: [
    { url: "/icons/icon-16.png", sizes: "16x16", type: "image/png", media: "(prefers-color-scheme: light)" },
    { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: light)" },
    { url: "/icons/icon-dark-16.png", sizes: "16x16", type: "image/png", media: "(prefers-color-scheme: dark)" },
    { url: "/icons/icon-dark-32.png", sizes: "32x32", type: "image/png", media: "(prefers-color-scheme: dark)" },
    { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
  ],
  apple: [{ url: "/icons/apple-icon.png", sizes: "180x180", type: "image/png" }],
}
