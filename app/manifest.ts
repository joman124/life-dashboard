import type { MetadataRoute } from 'next';

/**
 * Web app manifest, served by Next at /manifest.webmanifest.
 *
 * The spec calls this a mobile-first personal command center, but without a
 * manifest it could only ever be a browser tab. Installed to a home screen it
 * launches standalone — no URL bar, no tab strip — which is most of the
 * difference between "a website I check" and "an app I open".
 *
 * The icons are declared "any maskable": the ring sits inside the maskable safe
 * zone, so Android can crop it to any shape without clipping the mark.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Life Dashboard',
    short_name: 'Life',
    description: 'A personal command center for the metrics that matter.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0E0C08',
    theme_color: '#0E0C08',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
