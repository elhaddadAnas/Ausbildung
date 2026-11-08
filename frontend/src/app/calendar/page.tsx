'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  Calendar as CalendarIcon,
  Clock,
  ExternalLink,
  MapPin,
  MessageSquare,
  Video,
} from 'lucide-react';

function parseLinks(value: string | null | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const url = String(item.url || '').trim();
      if (!/^https?:\/\//i.test(url)) return [];
      return [{ url, label: String(item.label || '').trim() || 'Lien externe' }];
    });
  } catch {
    return [];
  }
}

export default function CalendarPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/applications', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Impossible de charger les rendez-vous.');
        setApplications(data.applications || []);
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : 'Impossible de charger les rendez-vous.');
      })
      .finally(() => setLoading(false));
  }, []);

  const events = useMemo(() => applications
    .filter((application) => application.interviewDate || application.latestReply?.appointmentAt)
    .map((application) => {
      const reply = application.latestReply;
      const date = new Date(reply?.appointmentAt || application.interviewDate);
      const links = parseLinks(reply?.detectedLinks);
      const meetingLink = reply?.appointmentLink
        || links.find((link) => /teams|zoom|meet|webex|skype/i.test(link.url))?.url
        || null;
      return {
        application,
        reply,
        date,
        meetingLink,
        links,
      };
    })
    .filter((event) => !Number.isNaN(event.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime()), [applications]);

  const upcoming = events.filter((event) => event.date.getTime() >= Date.now());
  const nextEvent = upcoming[0] || null;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
          <CalendarIcon className="w-3.5 h-3.5" />
          Entretiens détectés dans vos réponses
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white">
          Calendrier des rendez-vous
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Les invitations reçues par e-mail sont ajoutées automatiquement.
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-xl border border-rose-800 bg-rose-950/60 text-rose-200 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h3 className="font-bold text-white text-base border-b border-slate-800 pb-3">
            Prochain rendez-vous
          </h3>
          {loading ? (
            <p className="text-xs text-slate-500">Chargement...</p>
          ) : nextEvent ? (
            <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-xl space-y-2">
              <p className="text-xs font-bold text-amber-400">
                {nextEvent.application.jobOffer.company}
              </p>
              <p className="text-xs text-white font-semibold">
                {nextEvent.date.toLocaleString('fr-FR')}
              </p>
              <p className="text-[11px] text-slate-300">
                {nextEvent.application.jobOffer.title}
              </p>
              <Link
                href={`/messages?applicationId=${nextEvent.application.id}`}
                className="text-[11px] font-semibold text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                <MessageSquare className="w-3 h-3" />
                Ouvrir la conversation
              </Link>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Aucun rendez-vous à venir n’a encore été détecté.
            </p>
          )}
        </div>

        <div className="md:col-span-2 space-y-4">
          {!loading && events.length === 0 && (
            <div className="bg-slate-900/90 border border-slate-800 p-8 rounded-2xl text-center">
              <CalendarIcon className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-300">Aucun entretien planifié</p>
              <p className="text-xs text-slate-500 mt-1">
                Synchronisez vos réponses dans Messages pour détecter les invitations.
              </p>
            </div>
          )}

          {events.map(({ application, reply, date, meetingLink, links }) => (
            <div
              key={application.id}
              className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl space-y-3 hover:border-blue-500/40 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-950 px-2 py-0.5 rounded-md border border-blue-800/40">
                    Entretien d&apos;embauche
                  </span>
                  <h3 className="text-base font-bold text-white mt-2">
                    {application.jobOffer.title}
                  </h3>
                  <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mt-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-500" />
                    {application.jobOffer.company}
                  </p>
                </div>

                <div className="text-xs">
                  <p className="font-bold text-white flex items-center gap-1">
                    <CalendarIcon className="w-3.5 h-3.5 text-blue-400" />
                    {date.toLocaleDateString('fr-FR')}
                  </p>
                  <p className="text-slate-400 flex items-center gap-1 mt-1">
                    <Clock className="w-3.5 h-3.5 text-slate-500" />
                    {date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    {reply?.appointmentTimezone ? ` · ${reply.appointmentTimezone}` : ''}
                  </p>
                </div>
              </div>

              {reply?.aiSummary && (
                <p className="text-xs leading-relaxed text-slate-300 border-l-2 border-indigo-500 pl-3">
                  {reply.aiSummary}
                </p>
              )}

              <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-xs">
                {reply?.appointmentLocation && (
                  <span className="flex items-center gap-1 text-slate-400 mr-auto">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    {reply.appointmentLocation}
                  </span>
                )}

                {meetingLink && (
                  <a
                    href={meetingLink}
                    target="_blank"
                    rel="noreferrer nofollow"
                    className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg inline-flex items-center gap-1.5"
                  >
                    <Video className="w-3.5 h-3.5" />
                    Rejoindre la réunion
                  </a>
                )}

                <Link
                  href={`/messages?applicationId=${application.id}`}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg inline-flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Conversation
                </Link>
              </div>

              {links.filter((link) => link.url !== meetingLink).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {links
                    .filter((link) => link.url !== meetingLink)
                    .slice(0, 5)
                    .map((link) => (
                      <a
                        key={link.url}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer nofollow"
                        className="text-[11px] text-blue-400 hover:text-blue-300 inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {link.label}
                      </a>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
