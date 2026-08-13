'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Bookmark,
  BriefcaseBusiness,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileText,
  ListChecks,
  MapPin,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';

const columns = [
  {
    key: 'SAVED',
    title: 'Enregistrés',
    subtitle: 'À examiner',
    icon: Bookmark,
    accent: 'slate',
    column: 'border-slate-700/70 bg-slate-900/70',
    iconBox: 'border-slate-600/60 bg-slate-800 text-slate-300',
    dot: 'bg-slate-400',
  },
  {
    key: 'APPLIED',
    title: 'Postulés',
    subtitle: 'En attente',
    icon: Send,
    accent: 'blue',
    column: 'border-blue-900/80 bg-blue-950/25',
    iconBox: 'border-blue-700/60 bg-blue-950 text-blue-300',
    dot: 'bg-blue-400',
  },
  {
    key: 'INTERVIEW',
    title: 'Entretiens',
    subtitle: 'À préparer',
    icon: Calendar,
    accent: 'amber',
    column: 'border-amber-900/80 bg-amber-950/20',
    iconBox: 'border-amber-700/60 bg-amber-950 text-amber-300',
    dot: 'bg-amber-400',
  },
  {
    key: 'OFFER',
    title: 'Offres',
    subtitle: 'Bonne nouvelle',
    icon: CheckCircle2,
    accent: 'emerald',
    column: 'border-emerald-900/80 bg-emerald-950/20',
    iconBox: 'border-emerald-700/60 bg-emerald-950 text-emerald-300',
    dot: 'bg-emerald-400',
  },
  {
    key: 'REJECTED',
    title: 'Refusés',
    subtitle: 'Archivés',
    icon: XCircle,
    accent: 'rose',
    column: 'border-rose-950/90 bg-rose-950/15',
    iconBox: 'border-rose-800/60 bg-rose-950 text-rose-300',
    dot: 'bg-rose-400',
  },
] as const;

function parseJsonArray(value: string | null | undefined): any[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function ApplicationReplyInsights({ app }: { app: any }) {
  const reply = app.latestReply;
  if (!reply?.aiSummary && !app.interviewDate) return null;

  const actions = parseJsonArray(reply?.actionItems)
    .map((item) => String(item).trim())
    .filter(Boolean);
  const links = parseJsonArray(reply?.detectedLinks).flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const url = String(item.url || '').trim();
    if (!/^https?:\/\//i.test(url)) return [];
    return [{ url, label: String(item.label || '').trim() || 'Lien externe' }];
  });
  const appointmentAt = reply?.appointmentAt || app.interviewDate;

  return (
    <div className="rounded-2xl border border-indigo-800/50 bg-gradient-to-br from-indigo-950/60 to-slate-950/70 p-4 space-y-3 shadow-inner">
      {reply?.aiSummary && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-indigo-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />
              Dernière réponse
            </p>
            {reply.replyType && (
              <span className="rounded-full border border-indigo-700/60 bg-indigo-950 px-2 py-0.5 text-[9px] font-bold text-indigo-200">
                {reply.replyType === 'INTERVIEW' ? 'ENTRETIEN' : reply.replyType}
              </span>
            )}
          </div>
          <p className="text-xs leading-relaxed text-slate-200">
            {reply.aiSummary}
          </p>
        </>
      )}

      {appointmentAt && (
        <div className="rounded-xl border border-amber-800/50 bg-amber-950/35 px-3 py-2.5 text-xs font-semibold text-amber-200 flex items-start gap-2">
          <Calendar className="w-4 h-4 mt-0.5 shrink-0 text-amber-400" />
          <span>
            {new Date(appointmentAt).toLocaleString('fr-FR')}
            {reply?.appointmentLocation && (
              <span className="block mt-0.5 font-normal text-amber-200/75">
                {reply.appointmentLocation}
              </span>
            )}
          </span>
        </div>
      )}

      {actions.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-slate-400 flex items-center gap-1.5">
            <ListChecks className="w-3.5 h-3.5 text-blue-400" />
            Prochaines actions
          </p>
          {actions.slice(0, 3).map((action) => (
            <p key={action} className="text-[11px] leading-relaxed text-slate-300 flex gap-2">
              <span className="text-blue-400">•</span>
              <span>{action}</span>
            </p>
          ))}
        </div>
      )}

      {links.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {links.slice(0, 4).map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noreferrer nofollow"
              className="max-w-full rounded-lg border border-blue-800/70 bg-blue-950/80 px-2.5 py-1.5 text-[10px] font-semibold text-blue-300 hover:border-blue-500 hover:text-white inline-flex items-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-3 h-3 shrink-0" />
              <span className="truncate">{link.label}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function ApplicationCard({
  app,
  onStatusChange,
  onDelete,
}: {
  app: any;
  onStatusChange: (id: string, status: string) => void;
  onDelete: (id: string) => void;
}) {
  const company = app.jobOffer?.company || 'Entreprise';
  const title = app.jobOffer?.title || 'Ausbildungsstelle';
  const score = Math.max(0, Math.min(100, Number(app.matchScore) || 0));

  return (
    <article className="group rounded-2xl border border-slate-700/70 bg-slate-950/90 p-5 space-y-4 shadow-xl shadow-black/10 hover:-translate-y-0.5 hover:border-blue-500/60 hover:shadow-blue-950/20 transition-all duration-200">
      <div className="flex items-start gap-3.5">
        <div className="w-11 h-11 rounded-xl border border-slate-700 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center shrink-0 text-sm font-black text-slate-200 shadow-inner">
          {company.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-[15px] leading-snug text-white group-hover:text-blue-300 transition-colors">
            {title}
          </h4>
          <p className="mt-1.5 text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="truncate">{company}</span>
          </p>
          <p className="mt-1 text-[11px] text-slate-500 flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{app.jobOffer?.location || 'Allemagne'}</span>
          </p>
        </div>
      </div>

      {score > 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-bold uppercase tracking-wider text-slate-500">Compatibilité IA</span>
            <span className={`font-black ${
              score >= 75 ? 'text-emerald-400' : score >= 55 ? 'text-blue-400' : 'text-amber-400'
            }`}>
              {score}%
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full ${
                score >= 75
                  ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                  : score >= 55
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-400'
                    : 'bg-gradient-to-r from-amber-600 to-orange-400'
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>
      )}

      <ApplicationReplyInsights app={app} />

      <div className="pt-1 flex items-center gap-2">
        <div className="relative flex-1">
          <select
            value={app.status}
            onChange={(event) => onStatusChange(app.id, event.target.value)}
            aria-label={`Modifier le statut de ${title}`}
            className="w-full appearance-none rounded-xl border border-slate-700 bg-slate-900 py-2.5 pl-3 pr-8 text-xs font-semibold text-slate-200 outline-none hover:border-slate-600 focus:border-blue-500 transition-colors"
          >
            <option value="SAVED">Enregistré</option>
            <option value="APPLIED">Postulé</option>
            <option value="INTERVIEW">Entretien</option>
            <option value="OFFER">Offre</option>
            <option value="REJECTED">Refusé</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-slate-500" />
        </div>

        <button
          type="button"
          onClick={() => onDelete(app.id)}
          className="w-10 h-10 rounded-xl border border-slate-800 bg-slate-900 text-slate-500 hover:border-rose-800 hover:bg-rose-950/60 hover:text-rose-400 flex items-center justify-center transition-colors"
          title="Supprimer la candidature"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2">
        {app.status !== 'SAVED' && (
          <Link
            href={`/messages?applicationId=${app.id}`}
            className="w-full rounded-xl border border-blue-800/60 bg-blue-950/55 px-3 py-2.5 text-xs font-bold text-blue-300 hover:border-blue-500 hover:bg-blue-900/60 hover:text-white flex items-center justify-center gap-2 transition-colors"
          >
            <MessageSquare className="w-4 h-4" />
            Ouvrir la conversation
          </Link>
        )}
        {app.jobOffer?.url && (
          <a
            href={app.jobOffer.url}
            target="_blank"
            rel="noreferrer nofollow"
            className="w-full rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2.5 text-xs font-semibold text-slate-400 hover:border-slate-600 hover:text-white flex items-center justify-center gap-2 transition-colors"
          >
            Voir l&apos;offre originale
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </article>
  );
}

function LoadingCard() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-5 space-y-4 animate-pulse">
      <div className="flex gap-3">
        <div className="w-11 h-11 rounded-xl bg-slate-800" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-4/5 rounded bg-slate-800" />
          <div className="h-3 w-2/3 rounded bg-slate-800" />
        </div>
      </div>
      <div className="h-14 rounded-xl bg-slate-900" />
      <div className="h-10 rounded-xl bg-slate-900" />
    </div>
  );
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchApplications = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/applications', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les candidatures.');
      setApplications(data.applications || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de charger les candidatures.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchApplications();
  }, []);

  const updateStatus = async (appId: string, newStatus: string) => {
    const previous = applications;
    setApplications((current) =>
      current.map((application) =>
        application.id === appId ? { ...application, status: newStatus } : application
      )
    );
    try {
      const response = await fetch('/api/applications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appId, status: newStatus }),
      });
      if (!response.ok) throw new Error('Le statut n’a pas pu être mis à jour.');
    } catch (caught) {
      setApplications(previous);
      setError(caught instanceof Error ? caught.message : 'Le statut n’a pas pu être mis à jour.');
    }
  };

  const deleteApplication = async (appId: string) => {
    try {
      const response = await fetch(`/api/applications?id=${appId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('La candidature n’a pas pu être supprimée.');
      setApplications((current) => current.filter((application) => application.id !== appId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'La candidature n’a pas pu être supprimée.');
    }
  };

  const activeCount = applications.filter((application) =>
    ['APPLIED', 'INTERVIEW', 'OFFER'].includes(application.status)
  ).length;
  const interviewCount = applications.filter((application) => application.status === 'INTERVIEW').length;
  const offerCount = applications.filter((application) => application.status === 'OFFER').length;

  return (
    <div className="w-full max-w-[1920px] mx-auto p-4 md:p-7 xl:p-9 space-y-7">
      <section className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/60 p-6 md:p-8 shadow-2xl shadow-black/20">
        <div className="absolute -right-20 -top-24 w-72 h-72 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
        <div className="relative flex flex-col xl:flex-row xl:items-end justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold text-blue-400 uppercase tracking-[0.18em] mb-2">
              <BriefcaseBusiness className="w-4 h-4" />
              Pipeline Ausbildung
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
              Mes candidatures
            </h1>
            <p className="max-w-2xl text-sm md:text-base text-slate-400 mt-2">
              Gérez chaque candidature, réponse et rendez-vous depuis un seul espace.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Actives', value: activeCount, color: 'text-blue-300' },
                { label: 'Entretiens', value: interviewCount, color: 'text-amber-300' },
                { label: 'Offres', value: offerCount, color: 'text-emerald-300' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="min-w-[88px] rounded-xl border border-slate-700/70 bg-slate-950/55 px-3 py-2 text-center backdrop-blur"
                >
                  <p className={`text-lg font-black ${stat.color}`}>{stat.value}</p>
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
            <Link
              href="/search"
              className="h-12 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-900/40 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Nouvelle candidature
            </Link>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-800 bg-rose-950/60 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" />
            Tableau Kanban
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Changez le statut d&apos;une carte pour la déplacer automatiquement.
          </p>
        </div>
        <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-400">
          {applications.length} candidature{applications.length === 1 ? '' : 's'}
        </span>
      </div>

      <section className="-mx-4 md:-mx-7 xl:-mx-9 px-4 md:px-7 xl:px-9 pb-5 overflow-x-auto overscroll-x-contain">
        <div className="flex items-stretch gap-5 min-w-max snap-x snap-mandatory">
          {columns.map((column) => {
            const columnApplications = applications.filter(
              (application) => application.status === column.key
            );
            const ColumnIcon = column.icon;

            return (
              <div
                key={column.key}
                className={`w-[330px] md:w-[360px] 2xl:w-[380px] min-h-[690px] snap-start rounded-3xl border p-4 flex flex-col ${column.column}`}
              >
                <header className="px-1 pb-4 mb-4 border-b border-slate-800/80">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${column.iconBox}`}>
                        <ColumnIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h2 className="text-sm font-extrabold text-white">{column.title}</h2>
                        <p className="text-[10px] font-medium text-slate-500 mt-0.5">
                          {column.subtitle}
                        </p>
                      </div>
                    </div>
                    <span className="min-w-8 h-8 rounded-full border border-slate-700 bg-slate-950/80 px-2 text-xs font-black text-slate-200 flex items-center justify-center">
                      {columnApplications.length}
                    </span>
                  </div>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-800/80">
                    <div className={`h-full w-1/3 rounded-full ${column.dot}`} />
                  </div>
                </header>

                <div className="space-y-4 flex-1">
                  {loading ? (
                    <>
                      <LoadingCard />
                      <LoadingCard />
                    </>
                  ) : columnApplications.length > 0 ? (
                    columnApplications.map((application) => (
                      <ApplicationCard
                        key={application.id}
                        app={application}
                        onStatusChange={updateStatus}
                        onDelete={deleteApplication}
                      />
                    ))
                  ) : (
                    <div className="h-40 rounded-2xl border border-dashed border-slate-700/80 bg-slate-950/25 flex flex-col items-center justify-center text-center px-6">
                      <ColumnIcon className="w-7 h-7 text-slate-700 mb-2" />
                      <p className="text-xs font-bold text-slate-500">Aucune candidature</p>
                      <p className="text-[10px] text-slate-600 mt-1">
                        Les candidatures déplacées ici apparaîtront dans cette colonne.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
