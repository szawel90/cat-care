import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Cat Care',
    short_name: 'Cat Care',
    description: 'A thoughtful space for you and your cat.',
    start_url: '/account',
    scope: '/',
    display: 'standalone',
    background_color: '#faf9f5',
    theme_color: '#264d3a',
    lang: 'en',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
