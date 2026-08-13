'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Lock, Mail } from 'lucide-react';
import AuthFrame from '@/components/AuthFrame';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Connexion échouée.');
      }
      router.replace('/dashboard');
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Connexion échouée.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFrame title="Bon retour parmi nous." description="Reprenez votre recherche exactement là où vous l’avez laissée.">
        {error && (
          <div
            role="alert"
            className="mb-6 flex gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3.5 text-xs font-medium text-rose-300"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              Adresse e-mail
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-4 h-4 w-4 text-slate-500" />
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-black/20 py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-slate-600 focus:border-blue-400 focus:outline-none"
                placeholder="nom@exemple.fr"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              Mot de passe
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-4 h-4 w-4 text-slate-500" />
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-black/20 py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-slate-600 focus:border-blue-400 focus:outline-none"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-950/50 transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            {loading ? 'Connexion…' : 'Se connecter'}
            {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
          </button>
        </form>

        <p className="mt-7 text-center text-xs text-slate-500">
          Pas encore de compte ?{' '}
          <Link href="/register" className="font-bold text-blue-400 hover:text-blue-300">
            S’inscrire gratuitement
          </Link>
        </p>
    </AuthFrame>
  );
}
