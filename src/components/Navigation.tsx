'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  Sparkles, 
  Search, 
  BrainCircuit, 
  FileText, 
  MessageSquare,
  User, 
  Calendar, 
  Settings, 
  ShieldCheck, 
  LogOut, 
  Sun, 
  Moon, 
  LayoutDashboard,
  CreditCard,
  Menu,
  X
} from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.json())
      .then(data => {
        if (data.user) setCurrentUser(data.user);
      })
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    if (pathname === '/login' || pathname === '/register') return;
    const loadUnreadMessages = () => {
      fetch('/api/messages', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => setUnreadMessages(Number(data.unreadCount) || 0))
        .catch(() => {});
    };
    loadUnreadMessages();
    const timer = window.setInterval(loadUnreadMessages, 30_000);
    return () => window.clearInterval(timer);
  }, [pathname]);

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setCurrentUser(null);
    router.push('/login');
  };

  const navItems: Array<{
    label: string;
    href: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { label: 'Tableau de bord', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Recherche Ausbildung', href: '/search', icon: Search },
    { label: 'Matching IA & Lettre', href: '/ai-matching', icon: BrainCircuit },
    { label: 'Candidatures', href: '/applications', icon: FileText },
    { label: 'Messages', href: '/messages', icon: MessageSquare, badge: unreadMessages },
    { label: 'Profil & CV', href: '/profile', icon: User },
    { label: 'Calendrier', href: '/calendar', icon: Calendar },
    { label: 'Paramètres & SMTP', href: '/settings', icon: Settings },
    { label: 'Abonnement', href: '/subscription', icon: CreditCard },
    ...(currentUser?.role === 'ADMIN'
      ? [{ label: 'Console Admin', href: '/admin', icon: ShieldCheck }]
      : []),
  ];

  const isAuthPage = pathname === '/' || pathname === '/login' || pathname === '/register';
  if (isAuthPage) return null;

  return (
    <>
      {/* Top Mobile Bar */}
      <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white sticky top-0 z-50">
        <Link href="/dashboard" className="flex items-center gap-2 font-bold text-lg text-blue-600 dark:text-blue-400">
          <div className="p-1.5 bg-blue-600 rounded-lg text-white">
            <Sparkles className="w-5 h-5" />
          </div>
          <span>Ausbildung Finder AI</span>
        </Link>
        <div className="flex items-center gap-2">
          <button 
            onClick={toggleTheme} 
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-blue-600 dark:hover:text-white transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5 text-amber-400" /> : <Moon className="w-5 h-5 text-blue-600" />}
          </button>
          <button 
            onClick={() => setMobileOpen(!mobileOpen)} 
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Desktop Sidebar / Mobile Drawer */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-transform duration-300 flex flex-col justify-between
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div>
          {/* Logo */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800">
            <Link href="/" className="flex items-center gap-2.5 font-bold text-lg text-slate-900 dark:text-white">
              <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-600 rounded-xl text-white shadow-lg shadow-blue-500/20">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-300 bg-clip-text text-transparent">Ausbildung AI</span>
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 font-normal">Automation Bundesagentur</span>
              </div>
            </Link>
          </div>

          {/* Nav Links */}
          <div className="p-4 space-y-1">
            <p className="px-3 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Navigation</p>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-200
                    ${active 
                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 font-semibold' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                    }
                  `}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-white' : 'text-slate-500 dark:text-slate-400'}`} />
                  <span className="flex-1">{item.label}</span>
                  {Boolean(item.badge) && (
                    <span className={`min-w-5 h-5 px-1 rounded-full text-[10px] font-bold flex items-center justify-center ${
                      active ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'
                    }`}>
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Footer Profile & Theme Toggle */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Mode Thème</span>
            <button
              onClick={toggleTheme}
              className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors font-medium"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" /> Sombre
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-blue-600" /> Clair
                </>
              )}
            </button>
          </div>

          {currentUser ? (
            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white text-xs">
                  {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div className="truncate">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{currentUser.name}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{currentUser.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                title="Se déconnecter"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-rose-500 transition-colors"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="flex items-center justify-center gap-2 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold"
            >
              Se connecter / S'inscrire
            </Link>
          )}
        </div>
      </aside>
    </>
  );
}
