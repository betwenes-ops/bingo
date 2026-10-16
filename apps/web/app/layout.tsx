import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Bingo | Um novo jeito de estar junto',
  description: 'Bingo multiplayer de demonstração. Créditos fictícios sem valor monetário.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
