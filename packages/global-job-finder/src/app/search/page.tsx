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
  Sparkles, 
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
  const [was, setWas] = useState(searchParams.get('query') || '');
  const [wo, setWo] = useState(searchParams.get('location') || '');
  const [country, setCountry] = useState(searchParams.get('country') || 'Morocco');
  const [category, setCategory] = useState('All');
  const [contractType, setContractType] = useState('Any');
  const [remote, setRemote] = useState(false);
  const [internationalApplicants, setInternationalApplicants] = useState(false);
  const [page, setPage] = useState(1);

  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [providers, setProviders] = useState<string[]>([]);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [appliedJobIds, setAppliedJobIds] = useState<string[]>([]);
  const [favoriteJobIds, setFavoriteJobIds] = useState<string[]>([]);
  const [actionMsg, setActionMsg] = useState('');
  const [actionError, setActionError] = useState(false);

  const fetchJobs = async (targetPage = page) => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (was) query.set('query', was);
      if (wo) query.set('location', wo);
      if (country && country !== 'All') query.set('country', country);
      if (category && category !== 'All') query.set('category', category);
      if (contractType && contractType !== 'Any') query.set('contractType', contractType);
      if (remote) query.set('remote', 'true');
      if (internationalApplicants) {
        query.set('internationalApplicants', 'true');
        query.set('applicantCountry', 'Morocco');
      }
      query.set('page', targetPage.toString());

      const res = await fetch(`/api/search?${query.toString()}`);
      const data = await res.json();
      if (data.jobs) {
        setJobs(data.jobs);
        setTotal(data.total || data.jobs.length);
        setProviders(Array.isArray(data.providers) ? data.providers : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs(1);
    setPage(1);
  }, [country, category, contractType, remote, internationalApplicants]);

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

  const toggleFavorite = async (jobId: string) => {
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobOfferId: jobId }),
      });
      const data = await res.json();
      if (data.isFavorite) {
        setFavoriteJobIds(prev => [...prev, jobId]);
      } else {
        setFavoriteJobIds(prev => prev.filter(id => id !== jobId));
      }
    } catch (err) {}
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
    } catch (err) {
      setActionError(true);
      setActionMsg('Erreur réseau pendant l’envoi de la candidature.');
    }
  };

  const totalPages = Math.ceil(total / 25) || 1;
  const directSearchLinks = [
    {
      label: 'Indeed Maroc',
      href: `https://ma.indeed.com/jobs?q=${encodeURIComponent(was)}&l=${encodeURIComponent(wo || (country === 'All' ? 'Maroc' : country))}`,
    },
    {
      label: 'LinkedIn Maroc',
      href: `https://ma.linkedin.com/jobs/search?keywords=${encodeURIComponent(was)}&location=${encodeURIComponent(wo || (country === 'All' ? 'Morocco' : country))}`,
    },
    { label: 'ReKrute', href: 'https://www.rekrute.com/offres.html' },
    { label: 'Emploi.ma', href: 'https://www.emploi.ma/recherche-jobs-maroc/' },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Maroc + international · sources officielles et agrégateurs autorisés</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white">
            Recherche d’emploi dans le monde entier
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Recherchez au Maroc ou les postes internationaux ouverts aux candidats marocains
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
              placeholder="Métier ou mot-clé (ex. Product Designer, Software Engineer)"
              value={was}
              onChange={(e) => setWas(e.target.value)}
              className="bg-transparent text-white text-sm focus:outline-none w-full placeholder-slate-500"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-950 px-4 py-3 rounded-xl border border-slate-800 focus-within:border-blue-500">
            <MapPin className="w-4 h-4 text-blue-400 shrink-0" />
            <input
              type="text"
              placeholder="Ville ou région (ex. Paris, Toronto, Dubai)"
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
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="bg-slate-950 text-slate-200 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="All">Tous les pays</option>
              <option value="Morocco">🇲🇦 Maroc</option>
              <option value="United States">États-Unis</option>
              <option value="Canada">Canada</option>
              <option value="United Kingdom">Royaume-Uni</option>
              <option value="France">France</option>
              <option value="Germany">Allemagne</option>
              <option value="Switzerland">Suisse</option>
              <option value="Spain">Espagne</option>
              <option value="Netherlands">Pays-Bas</option>
              <option value="United Arab Emirates">Émirats arabes unis</option>
              <option value="Singapore">Singapour</option>
              <option value="Australia">Australie</option>
              <option value="India">Inde</option>
            </select>

            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-slate-950 text-slate-200 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="All">Toutes les catégories</option>
              <option value="Technology">Technologie</option>
              <option value="Sales">Vente</option>
              <option value="Marketing">Marketing</option>
              <option value="Design">Design</option>
              <option value="Finance">Finance</option>
              <option value="Healthcare">Santé</option>
              <option value="Operations">Opérations</option>
            </select>

            <select
              value={contractType}
              onChange={(e) => setContractType(e.target.value)}
              className="bg-slate-950 text-slate-200 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none"
            >
              <option value="Any">Tous les contrats</option>
              <option value="Full-time">Temps plein</option>
              <option value="Part-time">Temps partiel</option>
              <option value="Contract">Freelance / contrat</option>
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

            <label className="flex items-center gap-1.5 cursor-pointer text-amber-200 select-none rounded-lg border border-amber-800/60 bg-amber-950/40 px-2.5 py-1.5">
              <input
                type="checkbox"
                checked={internationalApplicants}
                onChange={(e) => {
                  setInternationalApplicants(e.target.checked);
                  if (e.target.checked) setCountry('All');
                }}
                className="rounded border-amber-800 text-amber-500 focus:ring-0 bg-slate-950"
              />
              <span>Hors Maroc · accepte les candidats marocains</span>
            </label>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60 font-semibold">
              {providers.length ? `● ${providers.join(' + ')}` : '● Sources directes disponibles'}
            </span>
            <span className="text-slate-400 font-medium">
              <strong className="text-white">{total}</strong> offres d’emploi
            </span>
          </div>
        </div>
      </form>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Recherche directe sur les grands sites</h2>
            <p className="mt-1 text-xs text-slate-400">
              Indeed et LinkedIn n’autorisent pas l’agrégation libre de leurs offres. Ces liens ouvrent votre recherche directement sur chaque site.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {directSearchLinks.map((item) => (
              <a
                key={item.label}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-blue-500 hover:text-white"
              >
                {item.label}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Results Section */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm font-semibold">Recherche des offres internationales en cours…</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {jobs.length === 0 && (
            <div className="md:col-span-2 rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-10 text-center">
              <Globe className="mx-auto h-8 w-8 text-slate-500" />
              <p className="mt-3 text-sm font-semibold text-white">Aucune offre agrégée ne correspond exactement à ces filtres.</p>
              <p className="mt-1 text-xs text-slate-400">Essayez les boutons Indeed, LinkedIn, ReKrute et Emploi.ma ci-dessus.</p>
            </div>
          )}
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
                          {job.category || 'Employment'}
                        </span>
                        {job.acceptsInternationalApplicants && (
                          <span
                            title={job.internationalApplicantEvidence || ''}
                            className="text-[10px] font-bold text-amber-300 bg-amber-950/60 border border-amber-800/50 px-2 py-0.5 rounded-md"
                          >
                            ✓ Candidats internationaux
                          </span>
                        )}
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
                        <span>{job.contactEmail ? `E-mail vérifié : ${job.contactEmail}` : 'Candidature via le site de l’employeur'}</span>
                      </p>
                    </div>

                    <button
                      onClick={() => toggleFavorite(job.id)}
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
                    {job.internationalApplicantEvidence && (
                      <span className="flex items-center gap-1 bg-amber-950/60 text-amber-200 border border-amber-800/50 px-2.5 py-1 rounded-lg font-semibold">
                        <ShieldCheck className="w-3.5 h-3.5" />
                        {job.internationalApplicantEvidence}
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
                      <span>{job.provider || 'Source officielle'}</span> <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>

                  {job.contactEmail ? (
                    <button
                      onClick={() => handleOneClickApply(job)}
                      disabled={isApplied}
                      className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                        isApplied
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25'
                      }`}
                    >
                      {isApplied ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                      {isApplied ? 'Postulé' : 'Postuler par e-mail'}
                    </button>
                  ) : (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-blue-600/25 hover:bg-blue-500"
                    >
                      Postuler sur {job.provider || 'le site'}
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
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
                      {job.acceptsInternationalApplicants && (
                        <span className="mt-1 block text-[10px] font-semibold text-amber-300">
                          ✓ {job.internationalApplicantEvidence || 'Candidats internationaux'}
                        </span>
                      )}
                    </td>
                    <td className="p-4">{job.company}</td>
                    <td className="p-4 text-blue-400 font-medium">{job.contactEmail || 'Formulaire externe'}</td>
                    <td className="p-4">{job.location} {job.postalCode ? `(${job.postalCode})` : ''}</td>
                    <td className="p-4 flex items-center gap-2">
                      <Link
                        href={`/ai-matching?jobId=${job.id}`}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg font-semibold"
                      >
                        Match IA
                      </Link>
                      {job.contactEmail ? (
                        <button
                          onClick={() => handleOneClickApply(job)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold"
                        >
                          Postuler
                        </button>
                      ) : (
                        <a
                          href={job.url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold"
                        >
                          Ouvrir
                        </a>
                      )}
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
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Chargement des offres d'emploi...</div>}>
      <SearchContent />
    </Suspense>
  );
}
