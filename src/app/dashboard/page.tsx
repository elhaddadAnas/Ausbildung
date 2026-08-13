'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CheckCircle2,
  MapPin,
  MessageSquareReply,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type DashboardStats = {
  totalOffers: number; offersToday: number; appliedJobs: number; interviews: number;
  rejections: number; responses: number; savedJobs: number; nextInterviewAt: string | null;
};

const initialStats: DashboardStats = {
  totalOffers: 0, offersToday: 0, appliedJobs: 0, interviews: 0,
  rejections: 0, responses: 0, savedJobs: 0, nextInterviewAt: null,
};

export default function DashboardPage() {
  const [stats, setStats] = useState(initialStats);
  const [applications, setApplications] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState('');
  const [chartData, setChartData] = useState<Array<{ name: string; bewerbungen: number; matches: number }>>([]);

  const loadDashboard = async () => {
    try {
      const response = await fetch('/api/dashboard', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Le tableau de bord n’a pas pu être chargé.');
      setApplications(data.applications || []);
      setStats(data.stats || initialStats);
      setChartData(data.chartData || []);
    } catch (error) {
      setSearchMsg(error instanceof Error ? error.message : 'Le tableau de bord n’a pas pu être chargé.');
    }
  };

  useEffect(() => { void loadDashboard(); }, []);

  const triggerInstantSearch = async () => {
    setIsSearching(true);
    setSearchMsg('Azubora explore les nouvelles offres de la Bundesagentur für Arbeit…');
    try {
      const response = await fetch('/api/search', { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'La recherche a échoué.');
      setSearchMsg(`${data.totalSaved || 0} nouvelle(s) offre(s) et ${data.totalMatches || 0} nouveau(x) match(s) trouvés.`);
      await loadDashboard();
    } catch (error) {
      setSearchMsg(error instanceof Error ? error.message : 'La recherche a échoué.');
    } finally {
      setIsSearching(false);
    }
  };

  const metrics = [
    { label: 'Offres suivies', value: stats.totalOffers, detail: `+${stats.offersToday} aujourd’hui`, icon: BriefcaseBusiness, tone: 'from-blue-500 to-cyan-400' },
    { label: 'Candidatures', value: stats.appliedJobs, detail: 'envoyées', icon: Send, tone: 'from-violet-500 to-indigo-400' },
    { label: 'Entretiens', value: stats.interviews, detail: stats.nextInterviewAt ? new Date(stats.nextInterviewAt).toLocaleDateString('fr-FR') : 'à venir', icon: CalendarDays, tone: 'from-amber-500 to-orange-400' },
    { label: 'Réponses', value: stats.responses, detail: 'conversations', icon: MessageSquareReply, tone: 'from-emerald-500 to-teal-400' },
    { label: 'Favoris', value: stats.savedJobs, detail: 'à analyser', icon: Bookmark, tone: 'from-fuchsia-500 to-violet-400' },
    { label: 'Clôturées', value: stats.rejections, detail: 'refus', icon: XCircle, tone: 'from-rose-500 to-pink-400' },
  ];

  return (
    <div className="mx-auto max-w-[1500px] space-y-7 p-4 md:p-8 xl:p-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-white/[0.08] bg-[#0b1020] p-6 text-white shadow-2xl shadow-slate-950/10 sm:p-8">
        <div className="noise-overlay" />
        <div className="absolute -right-24 -top-32 h-80 w-80 rounded-full bg-blue-500/20 blur-[90px]" />
        <div className="relative flex flex-col justify-between gap-7 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-blue-300"><Sparkles className="h-3.5 w-3.5" /> Workspace en direct</div>
            <h1 className="mt-4 text-3xl font-black tracking-[-0.045em] sm:text-4xl">Votre prochaine opportunité<br /><span className="text-slate-500">se construit ici.</span></h1>
            <p className="mt-4 max-w-2xl text-sm font-medium leading-6 text-slate-400">Visualisez vos progrès, relancez une recherche et passez immédiatement à l’action.</p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button onClick={triggerInstantSearch} disabled={isSearching} className="group inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-blue-600 px-5 py-3.5 text-xs font-black text-white shadow-lg shadow-blue-950/40 transition hover:-translate-y-0.5 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${isSearching ? 'animate-spin' : ''}`} />{isSearching ? 'Recherche en cours…' : 'Actualiser les offres'}</button>
            <Link href="/search" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.06] px-5 py-3.5 text-xs font-black text-slate-200 transition hover:bg-white/10"><Search className="h-4 w-4" /> Explorer</Link>
          </div>
        </div>
      </section>

      {searchMsg && <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between rounded-2xl border border-blue-400/20 bg-blue-500/10 px-4 py-3 text-xs font-semibold text-blue-500 dark:text-blue-300"><span>{searchMsg}</span><button onClick={() => setSearchMsg('')} aria-label="Fermer">×</button></motion.div>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {metrics.map((metric, index) => <motion.article key={metric.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.045 }} whileHover={{ y: -4 }} className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white/80 p-4 shadow-sm backdrop-blur dark:border-white/[0.07] dark:bg-white/[0.035]"><div className={`absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r ${metric.tone}`} /><div className="flex items-center justify-between"><p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{metric.label}</p><span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br ${metric.tone} text-white shadow-lg`}><metric.icon className="h-3.5 w-3.5" /></span></div><p className="mt-5 text-3xl font-black tracking-tight text-slate-950 dark:text-white">{metric.value}</p><p className="mt-1 text-[10px] font-semibold text-slate-400">{metric.detail}</p></motion.article>)}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.45fr_.55fr]">
        <section className="rounded-[1.75rem] border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/[0.07] dark:bg-white/[0.035] sm:p-7">
          <div className="mb-6 flex items-start justify-between"><div><p className="text-base font-black text-slate-950 dark:text-white">Activité sur 7 jours</p><p className="mt-1 text-[11px] font-medium text-slate-400">Nouveaux matches et candidatures envoyées</p></div><span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-emerald-500">Live data</span></div>
          <div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} barGap={4}><defs><linearGradient id="matchBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5B7CFA" /><stop offset="1" stopColor="#7C5CFF" /></linearGradient><linearGradient id="applyBar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#34D399" /><stop offset="1" stopColor="#14B8A6" /></linearGradient></defs><CartesianGrid strokeDasharray="3 6" stroke="rgba(100,116,139,.18)" vertical={false} /><XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} /><YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} /><Tooltip cursor={{ fill: 'rgba(99,102,241,.06)' }} contentStyle={{ backgroundColor: '#0b1020', border: '1px solid rgba(255,255,255,.08)', borderRadius: '14px', color: '#fff', fontSize: 11 }} /><Bar dataKey="matches" fill="url(#matchBar)" name="Matches" radius={[6,6,2,2]} /><Bar dataKey="bewerbungen" fill="url(#applyBar)" name="Candidatures" radius={[6,6,2,2]} /></BarChart></ResponsiveContainer></div>
        </section>

        <section className="relative overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-violet-600 via-blue-600 to-cyan-500 p-6 text-white shadow-xl shadow-blue-950/15"><div className="noise-overlay" /><div className="relative"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur"><BrainCircuit className="h-5 w-5" /></span><p className="mt-8 text-2xl font-black tracking-tight">Studio IA</p><p className="mt-3 text-xs font-medium leading-6 text-blue-100">Comparez votre profil à une offre et obtenez une candidature personnalisée en quelques instants.</p><Link href="/ai-matching" className="group mt-8 flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 text-xs font-black text-blue-600 transition hover:-translate-y-0.5"><span>Ouvrir le studio</span><ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link><Link href="/profile" className="mt-3 flex items-center justify-between rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 text-xs font-black text-white"><span>Optimiser mon profil</span><ArrowUpRight className="h-4 w-4" /></Link></div></section>
      </div>

      <section className="rounded-[1.75rem] border border-slate-200/70 bg-white/80 p-5 shadow-sm backdrop-blur dark:border-white/[0.07] dark:bg-white/[0.035] sm:p-7">
        <div className="flex items-end justify-between gap-4"><div><p className="text-lg font-black text-slate-950 dark:text-white">Sélection pour vous</p><p className="mt-1 text-[11px] font-medium text-slate-400">Les offres les plus proches de votre profil</p></div><Link href="/search" className="flex items-center gap-1 text-[10px] font-black text-blue-500">Tout explorer <ArrowUpRight className="h-3.5 w-3.5" /></Link></div>
        <div className="mt-5 space-y-3">{applications.length ? applications.map((application) => <motion.div key={application.id} whileHover={{ x: 4 }} className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/70 bg-slate-50/70 p-4 transition hover:border-blue-300 dark:border-white/[0.06] dark:bg-black/15 dark:hover:border-blue-400/30 sm:flex-row sm:items-center"><div className="flex min-w-0 items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500"><Building2 className="h-5 w-5" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-black text-slate-950 dark:text-white">{application.jobOffer?.title || 'Offre d’Ausbildung'}</p><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-black text-emerald-500">{application.matchScore || 0}% match</span></div><div className="mt-1.5 flex flex-wrap gap-3 text-[10px] font-medium text-slate-400"><span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {application.jobOffer?.company || 'Entreprise'}</span><span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {application.jobOffer?.location || 'Allemagne'}</span></div></div></div><div className="flex items-center gap-2 self-end sm:self-auto"><span className="rounded-xl bg-slate-200/70 px-3 py-2 text-[9px] font-black text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">{application.status === 'INTERVIEW' ? 'Entretien' : application.status === 'APPLIED' ? 'Envoyée' : 'Enregistrée'}</span><Link href={`/ai-matching?jobId=${application.jobOffer?.id || ''}`} className="rounded-xl bg-slate-950 px-3 py-2 text-[9px] font-black text-white dark:bg-white dark:text-slate-950">Analyser</Link></div></motion.div>) : <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center dark:border-white/10"><CheckCircle2 className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-xs font-semibold text-slate-400">Lancez une recherche pour afficher vos premières recommandations.</p></div>}</div>
      </section>
    </div>
  );
}
