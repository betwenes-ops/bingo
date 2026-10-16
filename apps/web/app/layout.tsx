import { AppRuntime } from '../components/app-runtime';
import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Bingo | Um novo jeito de estar junto',
  description: 'Bingo multiplayer de demonstração. Créditos fictícios sem valor monetário.',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <AppRuntime />
        {children}
      </body>
    </html>
  );
}
