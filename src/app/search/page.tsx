'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { 
  Search, 
  MapPin, 
  Briefcase, 
  Filter, 
  Heart, 
  Send, 
  Building2, 
  Globe, 
  DollarSign,
  Check,
  BrainCircuit,
  RefreshCw,
  ExternalLink,
  Table as TableIcon,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Mail,
  AlertCircle
} from 'lucide-react';

function SearchContent() {
  const searchParams = useSearchParams();
  const [was, setWas] = useState(searchParams.get('was') || '');
  const [wo, setWo] = useState(searchParams.get('wo') || '');
  const [umkreis, setUmkreis] = useState<string>('');
  const [bundesland, setBundesland] = useState('Alle');
  const [category, setCategory] = useState('Alle');
  const [contractType, setContractType] = useState('Egal');
  const [remote, setRemote] = useState(false);
  const [page, setPage] = useState(1);

  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [appliedJobIds, setAppliedJobIds] = useState<string[]>([]);
  const [favoriteJobIds, setFavoriteJobIds] = useState<string[]>([]);
  const [actionMsg, setActionMsg] = useState('');
  const [actionError, setActionError] = useState(false);

  const fetchJobs = async (targetPage = page) => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (was) query.set('was', was);
      if (wo) query.set('wo', wo);
      if (umkreis) query.set('umkreis', umkreis);
      if (bundesland && bundesland !== 'Alle') query.set('bundesland', bundesland);
      if (category && category !== 'Alle') query.set('category', category);
      if (contractType && contractType !== 'Egal') query.set('contractType', contractType);
      if (remote) query.set('remote', 'true');
      query.set('page', targetPage.toString());

      const res = await fetch(`/api/search?${query.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'La recherche est temporairement indisponible.');
      if (data.jobs) {
        setJobs(data.jobs);
        setTotal(data.total || data.jobs.length);
      }
    } catch (err) {
      setJobs([]);
      setTotal(0);
      setActionError(true);
      setActionMsg(err instanceof Error ? err.message : 'La recherche est temporairement indisponible.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs(1);
    setPage(1);
    // Text fields are submitted explicitly; select filters trigger an automatic refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundesland, category, contractType, remote, umkreis]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchJobs(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage < 1) return;
    setPage(newPage);
    fetchJobs(newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleFavorite = async (job: any) => {
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobOfferId: job.id, jobData: job }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Le favori n’a pas pu être modifié.');
      if (data.isFavorite) {
        setFavoriteJobIds(prev => [...prev, job.id]);
      } else {
        setFavoriteJobIds(prev => prev.filter(id => id !== job.id));
      }
    } catch (err) {
      setActionError(true);
      setActionMsg(err instanceof Error ? err.message : 'Le favori n’a pas pu être modifié.');
    }
  };

  const handleOneClickApply = async (job: any) => {
    try {
      const res = await fetch('/api/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobOfferId: job.id,
          jobData: job,
          action: 'apply',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionError(false);
        setAppliedJobIds(prev => [...prev, job.id]);
        const recipient = data.recipientEmail || job.contactEmail;
        setActionMsg(`Candidature pour ${job.title} chez ${job.company} envoyée avec succès à : ${recipient} !`);
        setTimeout(() => setActionMsg(''), 5000);
      } else {
        setActionError(true);
        setActionMsg(data.error || 'La candidature n’a pas pu être envoyée.');
        setTimeout(() => setActionMsg(''), 7000);
      }
    } catch {
      setActionError(true);
      setActionMsg('Erreur réseau pendant l’envoi de la candidature.');
    }
  };

  const totalPages = Math.ceil(total / 25) || 1;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Offres Directes Bundesagentur für Arbeit (web.arbeitsagentur.de)</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white">
            Recherche d'Ausbildung en Allemagne
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Offres officielles ; l’adresse de candidature est vérifiée avant chaque envoi
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="bg-slate-900 border border-slate-800 p-1 rounded-xl flex items-center gap-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 ${
                viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" /> Grille
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 ${
                viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <TableIcon className="w-4 h-4" /> Tableau
            </button>
          </div>
        </div>
      </div>

      {actionMsg && (
        <div className={`p-4 text-sm rounded-2xl flex items-center justify-between shadow-lg ${
          actionError
            ? 'bg-rose-950/80 border border-rose-800 text-rose-200'
            : 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
        }`}>
          <div className="flex items-center gap-2">
            {actionError
              ? <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              : <Check className="w-5 h-5 text-emerald-400 shrink-0" />}
            <span>{actionMsg}</span>
          </div>
          <button onClick={() => setActionMsg('')} className="font-bold">×</button>
        </div>
      )}

      {/* Main Search Bar */}
      <form onSubmit={handleSearchSubmit} className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="flex items-center gap-2 bg-slate-950 px-4 py-3 rounded-xl border border-slate-800 focus-within:border-blue-500">
            <Briefcase className="w-4 h-4 text-blue-400 shrink-0" />
            <input
              type="text"
              placeholder="Métier ou mot-clé (ex: Fachinformatiker, Mechatroniker)"
              value={was}
              onChange={(e) => setWas(e.target.value)}
              className="bg-transparent text-white text-sm focus:outline-none w-full placeholder-slate-500"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-950 px-4 py-3 rounded-xl border border-slate-800 focus-within:border-blue-500">
            <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
            <input
              type="text"
              placeholder="Ville ou code postal (ex: Berlin, München, 10117)"
              value={wo}
              onChange={(e) => setWo(e.target.value)}
              className="bg-transparent text-white text-sm focus:outline-none w-full placeholder-slate-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-all"
          >
            <Search className="w-4 h-4" />
            <span>{loading ? 'Recherche en direct...' : 'Rechercher les Offres'}</span>
          </button>
        </div>

        {/* Extended Filter Options */}
        <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-1 text-slate-400 font-semibold">
              <Filter className="w-3.5 h-3.5" /> Filtres:
            </span>

            <select
              value={umkreis}
              onChange={(e) => setUmkreis(e.target.value)}
              className="bg-slate-950 text-slate-200 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="">Rayon (Km)</option>
              <option value="10">10 km</option>
              <option value="20">20 km</option>
              <option value="50">50 km</option>
              <option value="100">100 km</option>
            </select>

            <select
              value={bundesland}
              onChange={(e) => setBundesland(e.target.value)}
              className="bg-slate-950 text-slate-200 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="Alle">Tous les Länder</option>
              <option value="Baden-Württemberg">Bade-Wurtemberg</option>
              <option value="Bayern">Bavière (Bayern)</option>
              <option value="Berlin">Berlin</option>
              <option value="Brandenburg">Brandebourg</option>
              <option value="Hamburg">Hambourg</option>
              <option value="Hessen">Hesse (Hessen)</option>
              <option value="Nordrhein-Westfalen">Rhinanie-du-Nord-Westphalie</option>
              <option value="Sachsen">Saxe</option>
            </select>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-slate-950 text-slate-200 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="Alle">Toutes catégories</option>
              <option value="IT">IT & Logiciel</option>
              <option value="Kaufmännisch">Commerce & Gestion</option>
              <option value="Handwerk">Artisanat & Industrie</option>
              <option value="Gesundheit">Santé & Soins</option>
              <option value="Design">Design & Médias</option>
            </select>

            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value)}
              className="bg-slate-950 text-slate-200 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="Egal">Temps plein / Partiel</option>
              <option value="Vollzeit">Temps plein (Vollzeit)</option>
              <option value="Teilzeit">Temps partiel (Teilzeit)</option>
            </select>

            <label className="flex items-center gap-1.5 cursor-pointer text-slate-300 select-none">
              <input
                type="checkbox"
                checked={remote}
                onChange={(e) => setRemote(e.target.checked)}
                className="rounded border-slate-800 text-blue-600 focus:ring-0 bg-slate-950"
              />
              <span>Télétravail / Remote</span>
            </label>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-semibold">
              🟢 API Arbeitsagentur Live
            </span>
            <span className="text-slate-400 font-medium">
              <strong className="text-white">{total}</strong> offres d'Ausbildung
            </span>
          </div>
        </div>
      </form>

      {/* Results Section */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm font-semibold">Interrogation en direct du serveur web.arbeitsagentur.de...</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {jobs.map((job) => {
            const isApplied = appliedJobIds.includes(job.id) || job.hasApplied;
            const isFav = favoriteJobIds.includes(job.id) || job.isFavorite;

            return (
              <div
                key={job.id}
                className="bg-slate-900/90 border border-slate-800 hover:border-blue-500/50 p-6 rounded-2xl flex flex-col justify-between transition-all group shadow-lg"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-950 border border-blue-800/40 px-2 py-0.5 rounded-md">
                          {job.category || 'Berufsausbildung'}
                        </span>
                        {job.startDate && (
                          <span className="text-[10px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800/40 px-2 py-0.5 rounded-md">
                            Début: {job.startDate}
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-bold text-white group-hover:text-blue-400 transition-colors">
                        {job.title}
                      </h3>
                      <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mt-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-500" />
                        {job.company}
                      </p>
                      {/* Display specific contact email for this exact offer */}
                      <p className="text-[11px] text-blue-400 font-semibold flex items-center gap-1 mt-1">
                        <Mail className="w-3.5 h-3.5 text-blue-400" />
                        <span>E-mail : {job.contactEmail || 'vérifié au moment de postuler'}</span>
                      </p>
                    </div>

                    <button
                      onClick={() => toggleFavorite(job)}
                      className={`p-2 rounded-xl border transition-colors ${
                        isFav 
                          ? 'bg-rose-950 text-rose-400 border-rose-800' 
                          : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-rose-400'
                      }`}
                    >
                      <Heart className={`w-4 h-4 ${isFav ? 'fill-current' : ''}`} />
                    </button>
                  </div>

                  <p className="text-xs text-slate-300 line-clamp-3 mb-4 leading-relaxed">
                    {job.description}
                  </p>

                  <div className="flex flex-wrap gap-2 text-xs text-slate-400 mb-6">
                    <span className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" /> {job.location} {job.postalCode ? `(${job.postalCode})` : ''}
                    </span>
                    {job.salary && (
                      <span className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg text-emerald-400 font-semibold">
                        <DollarSign className="w-3.5 h-3.5" /> {job.salary}
                      </span>
                    )}
                    {job.remote && (
                      <span className="flex items-center gap-1 bg-indigo-950 text-indigo-300 border border-indigo-800/50 px-2.5 py-1 rounded-lg font-semibold">
                        <Globe className="w-3.5 h-3.5" /> Remote
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Link
                      href={`/ai-matching?jobId=${job.id}`}
                      className="flex items-center gap-1.5 text-xs text-blue-400 font-semibold hover:underline"
                    >
                      <BrainCircuit className="w-4 h-4" /> Lettre IA
                    </Link>
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                    >
                      <span>Arbeitsagentur</span> <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  <button
                    onClick={() => handleOneClickApply(job)}
                    disabled={isApplied}
                    className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                      isApplied
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25'
                    }`}
                  >
                    <span className="relative block h-3.5 w-3.5 shrink-0" aria-hidden="true">
                      <Check className={`absolute inset-0 h-3.5 w-3.5 ${isApplied ? 'block' : 'hidden'}`} />
                      <Send className={`absolute inset-0 h-3.5 w-3.5 ${isApplied ? 'hidden' : 'block'}`} />
                    </span>
                    <span className={isApplied ? 'inline' : 'hidden'} translate="no">
                      Postulé
                    </span>
                    <span className={isApplied ? 'hidden' : 'inline'} translate="no">
                      Postuler en 1 clic
                    </span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Data Table View */
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="p-4">Poste / Métier</th>
                  <th className="p-4">Entreprise</th>
                  <th className="p-4">E-mail Destinataire</th>
                  <th className="p-4">Lieu / PLZ</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-200">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="p-4 font-bold text-white">
                      {job.title}
                      <span className="block text-[10px] text-slate-400 font-normal">{job.category}</span>
                    </td>
                    <td className="p-4">{job.company}</td>
                    <td className="p-4 text-blue-400 font-medium">{job.contactEmail || 'Vérifié avant envoi'}</td>
                    <td className="p-4">{job.location} {job.postalCode ? `(${job.postalCode})` : ''}</td>
                    <td className="p-4 flex items-center gap-2">
                      <Link
                        href={`/ai-matching?jobId=${job.id}`}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg font-semibold"
                      >
                        Match IA
                      </Link>
                      <button
                        onClick={() => handleOneClickApply(job)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold"
                      >
                        Postuler
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="pt-4 flex items-center justify-between text-xs text-slate-400 border-t border-slate-800">
          <span>Page <strong className="text-white">{page}</strong> sur <strong className="text-white">{totalPages}</strong></span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 disabled:opacity-40 text-slate-300 hover:text-white"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 disabled:opacity-40 text-slate-300 hover:text-white"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Chargement des offres d'Ausbildung...</div>}>
      <SearchContent />
    </Suspense>
  );
}
