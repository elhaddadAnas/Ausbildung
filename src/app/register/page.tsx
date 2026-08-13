'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Lock, Mail, User } from 'lucide-react';
import AuthFrame from '@/components/AuthFrame';

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');

    if (password.length < 10) {
      setError('Le mot de passe doit contenir au moins 10 caractères.');
      return;
    }
    if (password !== passwordConfirmation) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Inscription échouée.');
      }
      router.replace('/dashboard');
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Inscription échouée.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthFrame title="Construisez votre avenir." description="Créez gratuitement votre workspace de recherche d’Ausbildung.">
        {error && (
          <div
            role="alert"
            className="mb-6 flex gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 p-3.5 text-xs font-medium text-rose-300"
          >
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label htmlFor="name" className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              Nom complet
            </label>
            <div className="relative">
              <User className="absolute left-4 top-4 h-4 w-4 text-slate-500" />
              <input
                id="name"
                name="name"
                type="text"
                autoComplete="name"
                minLength={2}
                maxLength={100}
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-black/20 py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-slate-600 focus:border-blue-400 focus:outline-none"
                placeholder="Jean Dupont"
              />
            </div>
          </div>

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
                placeholder="jean@exemple.fr"
              />
            </div>
          </div>

          <div>
            <label htmlFor="new-password" className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              Mot de passe
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-4 h-4 w-4 text-slate-500" />
              <input
                id="new-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-black/20 py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-slate-600 focus:border-blue-400 focus:outline-none"
                placeholder="Au moins 10 caractères"
              />
            </div>
          </div>

          <div>
            <label htmlFor="password-confirmation" className="mb-2 block text-[10px] font-black uppercase tracking-wider text-slate-400">
              Confirmer le mot de passe
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-4 h-4 w-4 text-slate-500" />
              <input
                id="password-confirmation"
                name="passwordConfirmation"
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                required
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-black/20 py-3.5 pl-11 pr-4 text-sm text-white placeholder:text-slate-600 focus:border-blue-400 focus:outline-none"
                placeholder="Répétez le mot de passe"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 py-3.5 text-sm font-black text-white shadow-lg shadow-blue-950/50 transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            {loading ? 'Création…' : 'Créer mon compte'}
            {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
          </button>
        </form>

        <p className="mt-7 text-center text-xs text-slate-500">
          Déjà inscrit ?{' '}
          <Link href="/login" className="font-bold text-blue-400 hover:text-blue-300">
            Se connecter
          </Link>
        </p>
    </AuthFrame>
  );
}
