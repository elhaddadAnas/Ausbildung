'use client';

import { usePathname } from 'next/navigation';
import Navigation from '@/components/Navigation';

const PUBLIC_ROUTES = new Set(['/', '/login', '/register']);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);

  return (
    <>
      {!isPublicRoute && <Navigation />}
      <main className={`min-h-screen w-full flex-1 ${isPublicRoute ? '' : 'lg:pl-64'}`}>
        {children}
      </main>
    </>
  );
}
