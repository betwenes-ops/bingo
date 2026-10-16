import type { Metadata } from 'next';
import '../../web/app/globals.css';
import './admin.css';
export const metadata: Metadata = {
  title: 'Bingo | Operação',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
