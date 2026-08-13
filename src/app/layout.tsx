import './globals.css';
import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/ThemeProvider';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: {
    default: 'Ausbildung Finder AI — Trouvez votre Ausbildung en Allemagne',
    template: '%s | Ausbildung Finder AI',
  },
  description:
    'Recherchez des offres d’Ausbildung, générez des candidatures personnalisées avec votre CV et centralisez les réponses des entreprises.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de" className="dark">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
