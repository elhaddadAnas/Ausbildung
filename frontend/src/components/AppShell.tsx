'use client';

import { usePathname } from 'next/navigation';
import { motion, useReducedMotion } from 'motion/react';
import Navigation from '@/components/Navigation';

const PUBLIC_ROUTES = new Set(['/', '/login', '/register']);

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();
  const isPublicRoute = PUBLIC_ROUTES.has(pathname);

  return (
    <>
      {!isPublicRoute && <Navigation />}
      {isPublicRoute ? children : (
        <main className="product-main min-h-screen w-full flex-1 lg:pl-[280px]">
          <motion.div
            key={pathname}
            className="app-view"
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          >
            {children}
          </motion.div>
        </main>
      )}
    </>
  );
}
