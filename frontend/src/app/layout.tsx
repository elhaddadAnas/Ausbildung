import './globals.css';
import type { Metadata } from 'next';
import { ThemeProvider } from '@/components/ThemeProvider';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: {
    default: 'Azubora — Votre carrière en Allemagne, en mouvement',
    template: '%s | Azubora',
  },
  description:
    'Trouvez votre Ausbildung, automatisez des candidatures personnalisées et centralisez les réponses des entreprises avec Azubora.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="dark">
      <body className="min-h-screen bg-[#f5f7fb] text-slate-900 antialiased transition-colors duration-300 dark:bg-[#070a12] dark:text-slate-100">
        <ThemeProvider>
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}
