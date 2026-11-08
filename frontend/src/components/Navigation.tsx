'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import {
  BadgeEuro,
  BrainCircuit,
  CalendarDays,
  ChevronRight,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  Moon,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
  X,
} from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';
import { useTheme } from '@/components/ThemeProvider';

type CurrentUser = { name: string; email: string; role: string } | null;

const primaryNavigation = [
  { label: 'Vue d’ensemble', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Trouver une offre', href: '/search', icon: Search },
  { label: 'Studio IA', href: '/ai-matching', icon: BrainCircuit },
  { label: 'Candidatures', href: '/applications', icon: FileText },
  { label: 'Messages', href: '/messages', icon: MessageSquare },
  { label: 'Calendrier', href: '/calendar', icon: CalendarDays },
];

const accountNavigation = [
  { label: 'Profil & CV', href: '/profile', icon: UserRound },
  { label: 'Automatisation', href: '/settings', icon: Settings2 },
  { label: 'Formule & crédits', href: '/subscription', icon: BadgeEuro },
];

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [currentUser, setCurrentUser] = useState<CurrentUser>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((response) => response.json())
      .then((data) => data.user && setCurrentUser(data.user))
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    const loadUnreadMessages = () => {
      fetch('/api/messages', { cache: 'no-store' })
        .then((response) => response.json())
        .then((data) => setUnreadMessages(Number(data.unreadCount) || 0))
        .catch(() => {});
    };
    loadUnreadMessages();
    const timer = window.setInterval(loadUnreadMessages, 30_000);
    return () => window.clearInterval(timer);
  }, [pathname]);

  useEffect(() => setMobileOpen(false), [pathname]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setCurrentUser(null);
    router.push('/login');
  };

  const renderItems = (items: typeof primaryNavigation) => items.map((item) => {
    const active = pathname === item.href;
    const badge = item.href === '/messages' ? unreadMessages : 0;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={`group relative flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-semibold transition-colors ${active ? 'text-white' : 'text-slate-400 hover:text-white'}`}
      >
        {active && (
          <motion.span
            layoutId="active-navigation"
            className="absolute inset-0 rounded-2xl border border-white/10 bg-white/[0.09] shadow-[0_12px_30px_-18px_rgba(79,109,245,0.9)]"
            transition={{ type: 'spring', stiffness: 430, damping: 34 }}
          />
        )}
        <span className={`relative flex h-8 w-8 items-center justify-center rounded-xl transition-all ${active ? 'bg-gradient-to-br from-violet-500 to-blue-500 text-white shadow-lg shadow-blue-950/50' : 'bg-white/[0.045] text-slate-500 group-hover:bg-white/[0.08] group-hover:text-blue-300'}`}>
          <item.icon className="h-4 w-4" />
        </span>
        <span className="relative flex-1">{item.label}</span>
        {badge > 0 ? (
          <span className="relative flex min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[9px] font-black text-white">{badge}</span>
        ) : (
          <ChevronRight className={`relative h-3.5 w-3.5 transition-all ${active ? 'translate-x-0 opacity-70' : '-translate-x-1 opacity-0 group-hover:translate-x-0 group-hover:opacity-50'}`} />
        )}
      </Link>
    );
  });

  const sidebar = (
    <aside className="flex h-full w-[280px] flex-col overflow-hidden border-r border-white/[0.07] bg-[#090d18]/95 text-white shadow-2xl shadow-slate-950/30 backdrop-blur-2xl">
      <div className="relative border-b border-white/[0.07] px-5 py-5">
        <div className="pointer-events-none absolute -left-8 -top-12 h-28 w-28 rounded-full bg-blue-500/20 blur-3xl" />
        <BrandLogo href="/dashboard" inverse />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-5">
        <p className="mb-2 px-3 text-[9px] font-black uppercase tracking-[0.24em] text-slate-600">Workspace</p>
        <nav className="space-y-1" aria-label="Navigation principale">{renderItems(primaryNavigation)}</nav>

        <div className="my-5 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <p className="mb-2 px-3 text-[9px] font-black uppercase tracking-[0.24em] text-slate-600">Mon espace</p>
        <nav className="space-y-1" aria-label="Compte">{renderItems(accountNavigation)}</nav>

        {currentUser?.role === 'ADMIN' && (
          <div className="mt-5">
            <p className="mb-2 px-3 text-[9px] font-black uppercase tracking-[0.24em] text-slate-600">Administration</p>
            {renderItems([{ label: 'Console système', href: '/admin', icon: ShieldCheck }])}
          </div>
        )}
      </div>

      <div className="space-y-3 border-t border-white/[0.07] p-3">
        <Link href="/subscription" className="group block overflow-hidden rounded-2xl border border-blue-400/15 bg-gradient-to-br from-violet-500/15 via-blue-500/10 to-emerald-400/10 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-blue-300"><Sparkles className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-black text-white">Accélérer ma recherche</span>
              <span className="mt-1 block text-[10px] leading-4 text-slate-400">Formules flexibles et crédits IA à la demande.</span>
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.035] p-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 text-xs font-black text-white">
            {currentUser?.name?.charAt(0).toUpperCase() || 'A'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold text-white">{currentUser?.name || 'Compte Azubora'}</p>
            <p className="truncate text-[9px] text-slate-500">{currentUser?.email || 'Chargement…'}</p>
          </div>
          <button onClick={toggleTheme} className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-white" aria-label="Changer de thème">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <button onClick={handleLogout} className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-500/10 hover:text-rose-400" aria-label="Se déconnecter">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      <header className="sticky top-0 z-50 flex h-16 items-center justify-between border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-xl dark:border-white/[0.07] dark:bg-[#090d18]/85 lg:hidden">
        <BrandLogo href="/dashboard" />
        <div className="flex items-center gap-2">
          <button onClick={toggleTheme} className="rounded-xl border border-slate-200 bg-slate-100 p-2.5 text-slate-600 dark:border-white/[0.07] dark:bg-white/5 dark:text-slate-300" aria-label="Changer de thème">
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button onClick={() => setMobileOpen(true)} className="rounded-xl bg-slate-950 p-2.5 text-white dark:bg-white dark:text-slate-950" aria-label="Ouvrir le menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">{sidebar}</div>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.button
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-[60] bg-slate-950/75 backdrop-blur-sm lg:hidden"
              aria-label="Fermer le menu"
            />
            <motion.div
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 36 }}
              className="fixed inset-y-0 left-0 z-[70] lg:hidden"
            >
              {sidebar}
              <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 rounded-xl bg-white/5 p-2 text-slate-400" aria-label="Fermer"><X className="h-5 w-5" /></button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
