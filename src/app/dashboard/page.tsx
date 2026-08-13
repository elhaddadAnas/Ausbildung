'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  Briefcase, 
  Send, 
  Calendar, 
  XCircle, 
  CheckCircle2, 
  Bookmark, 
  Sparkles, 
  Search, 
  BrainCircuit, 
  RefreshCw, 
  ArrowUpRight,
  Building2,
  MapPin
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalOffers: 0,
    offersToday: 0,
    appliedJobs: 0,
    interviews: 0,
    rejections: 0,
    responses: 0,
    savedJobs: 0,
    nextInterviewAt: null as string | null,
  });
  const [applications, setApplications] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchMsg, setSearchMsg] = useState('');
  const [chartData, setChartData] = useState<Array<{
    name: string;
    bewerbungen: number;
    matches: number;
  }>>([]);

  const loadDashboard = async () => {
    await fetch('/api/dashboard', { cache: 'no-store' })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Le tableau de bord n’a pas pu être chargé.');
        return data;
      })
      .then(data => {
        if (data.applications) {
          setApplications(data.applications);
          setStats(data.stats);
          setChartData(data.chartData || []);
        }
      })
      .catch(error => setSearchMsg(
        error instanceof Error ? error.message : 'Le tableau de bord n’a pas pu être chargé.'
      ));
  };

  useEffect(() => {
    void loadDashboard();
  }, []);

  const triggerInstantSearch = async () => {
    setIsSearching(true);
    setSearchMsg("Recherche dans la base de données de l'Arbeitsagentur...");

    try {
      const res = await fetch('/api/search', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'La recherche a échoué.');
      setSearchMsg(
        `Recherche terminée : ${data.totalSaved || 0} nouvelle(s) offre(s), ` +
        `${data.totalMatches || 0} nouveau(x) match(s).`
      );
      await loadDashboard();
    } catch (err) {
      setSearchMsg(err instanceof Error ? err.message : 'La recherche a échoué.');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            <Sparkles className="w-3.5 h-3.5" /> Aperçu du Tableau de Bord
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white">
            Bienvenue sur votre espace !
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Analyses automatiques d'Ausbildung en Allemagne (Bundesagentur für Arbeit)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={triggerInstantSearch}
            disabled={isSearching}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-600/25 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${isSearching ? 'animate-spin' : ''}`} />
            <span>{isSearching ? 'Recherche...' : 'Lancer la Recherche IA'}</span>
          </button>
          <Link
            href="/search"
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm rounded-xl border border-slate-700 transition-colors"
          >
            <Search className="w-4 h-4" />
            <span>Toutes les offres</span>
          </Link>
        </div>
      </div>

      {searchMsg && (
        <div className="p-3 bg-blue-950/60 border border-blue-800 text-blue-300 text-xs rounded-xl flex items-center justify-between">
          <span>{searchMsg}</span>
          <button onClick={() => setSearchMsg('')} className="text-blue-400 font-bold">×</button>
        </div>
      )}

      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Offres</span>
            <Briefcase className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-extrabold text-white">{stats.totalOffers}</p>
          <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-0.5">
            +{stats.offersToday} importée(s) aujourd&apos;hui
          </p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Postulés</span>
            <Send className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-2xl font-extrabold text-white">{stats.appliedJobs}</p>
          <p className="text-[10px] text-slate-400 mt-1">1-Clic Postulés</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Entretiens</span>
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
          <p className="text-2xl font-extrabold text-amber-300">{stats.interviews}</p>
          <p className="text-[10px] text-amber-400/80 mt-1">
            {stats.nextInterviewAt
              ? `Prochain : ${new Date(stats.nextInterviewAt).toLocaleDateString('fr-FR')}`
              : 'Aucun entretien planifié'}
          </p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Refus</span>
            <XCircle className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-2xl font-extrabold text-slate-300">{stats.rejections}</p>
          <p className="text-[10px] text-slate-400 mt-1">Candidatures clôturées</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Réponses</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-400">{stats.responses}</p>
          <p className="text-[10px] text-emerald-400/80 mt-1">Conversations reçues</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold">Favoris</span>
            <Bookmark className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-extrabold text-white">{stats.savedJobs}</p>
          <p className="text-[10px] text-slate-400 mt-1">Enregistrés</p>
        </div>
      </div>

      {/* Analytics & Quick Actions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Activity Chart */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 p-6 rounded-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-bold text-white text-base">Activité Hebdomadaire & Matches IA</h3>
              <p className="text-xs text-slate-400">Recherches automatiques des 7 derniers jours</p>
            </div>
            <span className="text-xs px-2.5 py-1 bg-slate-800 text-slate-300 rounded-lg border border-slate-700">
              Données en direct
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', color: '#fff' }} 
                />
                <Bar dataKey="matches" fill="#3b82f6" name="Nouveaux Matches IA" radius={[4, 4, 0, 0]} />
                <Bar dataKey="bewerbungen" fill="#10b981" name="Candidatures" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Quick AI Tools Card */}
        <div className="bg-gradient-to-br from-blue-950/40 via-slate-900 to-indigo-950/40 border border-blue-800/40 p-6 rounded-2xl flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white mb-4 shadow-lg shadow-blue-500/30">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">Générateur de Lettre IA</h3>
            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              Générez une lettre de motivation en allemand (DIN 5008) parfaitement adaptée à votre CV et à l'offre d'Ausbildung.
            </p>
          </div>

          <div className="space-y-2">
            <Link
              href="/ai-matching"
              className="flex items-center justify-between w-full p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-xs transition-all shadow-md shadow-blue-600/20"
            >
              <span>Créer une Lettre IA maintenant</span>
              <ArrowUpRight className="w-4 h-4" />
            </Link>
            <Link
              href="/profile"
              className="flex items-center justify-between w-full p-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-medium text-xs transition-colors"
            >
              <span>Gérer mon CV & mes Compétences</span>
              <ArrowUpRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Top Recommendations Table / Cards */}
      <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="font-bold text-white text-lg">Recommandations d'Ausbildung</h3>
            <p className="text-xs text-slate-400">Offres sélectionnées selon votre profil</p>
          </div>
          <Link href="/search" className="text-xs font-semibold text-blue-400 hover:underline flex items-center gap-1">
            Tout parcourir <ArrowUpRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="space-y-3">
          {applications.length > 0 ? (
            applications.map((app: any) => (
              <div 
                key={app.id}
                className="p-4 bg-slate-950/80 border border-slate-800/80 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-700 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-950 border border-blue-800/50 flex items-center justify-center text-blue-400 shrink-0 mt-0.5">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-white text-sm">{app.jobOffer?.title || 'Fachinformatiker Anwendungsentwicklung'}</h4>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950 text-blue-400 border border-blue-800/50">
                        {app.matchScore || 92}% Match Score
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400 mt-1">
                      <span className="flex items-center gap-1"><Building2 className="w-3.5 h-3.5" /> {app.jobOffer?.company || 'SAP SE'}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> {app.jobOffer?.location || 'Berlin'}</span>
                      <span className="text-emerald-400 font-semibold">{app.jobOffer?.salary || '1.250 €/Mois'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end md:self-center">
                  <span className={`px-3 py-1 rounded-lg text-xs font-semibold ${
                    app.status === 'INTERVIEW' ? 'bg-amber-950 text-amber-300 border border-amber-800/60' :
                    app.status === 'APPLIED' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60' :
                    'bg-slate-800 text-slate-300'
                  }`}>
                    {app.status === 'INTERVIEW' ? 'Entretien' : app.status === 'APPLIED' ? 'Postulé' : 'Enregistré'}
                  </span>
                  <Link
                    href={`/ai-matching?jobId=${app.jobOffer?.id || ''}`}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors"
                  >
                    Lettre
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-slate-500 text-sm">
              Aucune candidature. Utilisez la recherche d'Ausbildung pour ajouter de nouvelles offres !
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
