import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Bingo Demonstração',
    short_name: 'Bingo',
    description: 'Bingo com créditos fictícios, sem valor monetário.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0B0A12',
    theme_color: '#0B0A12',
    lang: 'pt-BR',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
