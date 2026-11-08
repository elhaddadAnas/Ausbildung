'use client';

import React, { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  CalendarDays,
  Clock3,
  ExternalLink,
  Inbox,
  ListChecks,
  Mail,
  MapPin,
  MessageSquare,
  RefreshCw,
  Send,
  Settings,
  Sparkles,
} from 'lucide-react';

interface ReplyLink {
  url: string;
  label: string;
}

interface ApplicationMessage {
  id: string;
  direction: 'INBOUND' | 'OUTBOUND';
  fromEmail: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  sentAt: string;
  readAt: string | null;
  aiSummary: string | null;
  replyType: string | null;
  actionItems: string | null;
  detectedLinks: string | null;
  analysisStatus: string | null;
  appointmentAt: string | null;
  appointmentEndAt: string | null;
  appointmentTimezone: string | null;
  appointmentLocation: string | null;
  appointmentLink: string | null;
}

interface Conversation {
  id: string;
  status: string;
  unreadCount: number;
  jobOffer: {
    title: string;
    company: string;
    location: string;
    contactEmail: string | null;
  };
  messages: ApplicationMessage[];
  lastMessage: ApplicationMessage | null;
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item).trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

function parseLinks(value: string | null): ReplyLink[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const record = item as Record<string, unknown>;
      const url = String(record.url || '').trim();
      if (!/^https?:\/\//i.test(url)) return [];
      return [{ url, label: String(record.label || '').trim() || 'Lien externe' }];
    });
  } catch {
    return [];
  }
}

const replyTypeLabels: Record<string, string> = {
  INTERVIEW: 'Rendez-vous / entretien',
  OFFER: 'Offre reçue',
  REJECTION: 'Refus',
  REQUEST: 'Action demandée',
  ACKNOWLEDGEMENT: 'Accusé de réception',
  OTHER: 'Réponse reçue',
};

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sending, setSending] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchConversations = useCallback(async (preferredId?: string) => {
    try {
      const response = await fetch('/api/messages', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible de charger les messages.');
      const nextConversations: Conversation[] = data.conversations || [];
      setConversations(nextConversations);
      setSelectedId((current) => {
        const requested = preferredId || current;
        if (requested && nextConversations.some((item) => item.id === requested)) return requested;
        return nextConversations[0]?.id || '';
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible de charger les messages.');
    } finally {
      setLoading(false);
    }
  }, []);

  const openConversation = useCallback(async (applicationId: string) => {
    setSelectedId(applicationId);
    try {
      const response = await fetch(`/api/messages/${applicationId}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Impossible d’ouvrir la conversation.');
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === applicationId
            ? {
                ...conversation,
                ...data.application,
                unreadCount: 0,
                lastMessage: data.application.messages.at(-1) || null,
              }
            : conversation
        )
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Impossible d’ouvrir la conversation.');
    }
  }, []);

  const syncInbox = useCallback(async (showFeedback = false) => {
    setSyncing(true);
    if (showFeedback) {
      setStatusMessage('');
      setError('');
    }
    try {
      const response = await fetch('/api/messages/sync', { method: 'POST' });
      const data = await response.json();
      if (!response.ok && !data.skipped) {
        throw new Error(data.error || 'Synchronisation impossible.');
      }
      if (showFeedback) {
        setStatusMessage(data.message || data.error || 'Synchronisation terminée.');
      }
      await fetchConversations();
    } catch (caught) {
      if (showFeedback) {
        setError(caught instanceof Error ? caught.message : 'Synchronisation impossible.');
      }
    } finally {
      setSyncing(false);
    }
  }, [fetchConversations]);

  useEffect(() => {
    const requestedId = new URLSearchParams(window.location.search).get('applicationId') || undefined;
    void fetchConversations(requestedId).then(() => void syncInbox(false));
    const timer = window.setInterval(() => void syncInbox(false), 30_000);
    return () => window.clearInterval(timer);
  }, [fetchConversations, syncInbox]);

  useEffect(() => {
    if (selectedId) void openConversation(selectedId);
  }, [selectedId, openConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedId, conversations]);

  const sendReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedId || !replyText.trim()) return;
    setSending(true);
    setError('');
    setStatusMessage('');
    try {
      const response = await fetch(`/api/messages/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: replyText }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Le message n’a pas pu être envoyé.');
      }
      setReplyText('');
      setStatusMessage('Réponse envoyée par e-mail.');
      await fetchConversations(selectedId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Le message n’a pas pu être envoyé.');
    } finally {
      setSending(false);
    }
  };

  const selected = conversations.find((conversation) => conversation.id === selectedId) || null;
  const latestInbound = selected
    ? [...selected.messages].reverse().find((message) => message.direction === 'INBOUND') || null
    : null;
  const latestActions = parseStringArray(latestInbound?.actionItems || null);
  const latestLinks = parseLinks(latestInbound?.detectedLinks || null);
  const totalUnread = conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0);

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            <MessageSquare className="w-4 h-4" />
            Messagerie des candidatures
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white">Messages</h1>
          <p className="text-sm text-slate-400 mt-1">
            Toutes vos candidatures et les réponses reçues par e-mail.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void syncInbox(true)}
          disabled={syncing}
          className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Synchronisation...' : 'Actualiser les réponses'}
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-xl border border-rose-800 bg-rose-950/60 text-rose-200 text-xs">
          {error}{' '}
          <Link href="/settings" className="font-bold underline">
            Vérifier les paramètres e-mail
          </Link>
        </div>
      )}
      {statusMessage && (
        <div className="p-3 rounded-xl border border-emerald-800 bg-emerald-950/60 text-emerald-200 text-xs">
          {statusMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)] min-h-[680px] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <aside className="border-b lg:border-b-0 lg:border-r border-slate-800">
          <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
            <div className="flex items-center gap-2 text-sm font-bold text-white">
              <Inbox className="w-4 h-4 text-blue-400" />
              Candidatures
            </div>
            {totalUnread > 0 && (
              <span className="min-w-6 h-6 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">
                {totalUnread}
              </span>
            )}
          </div>

          <div className="max-h-[300px] lg:max-h-[614px] overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center text-xs text-slate-400">Chargement...</div>
            ) : conversations.length === 0 ? (
              <div className="p-8 text-center">
                <Mail className="w-8 h-8 mx-auto text-slate-600 mb-3" />
                <p className="text-sm font-semibold text-slate-300">Aucune candidature envoyée</p>
                <Link href="/search" className="text-xs text-blue-400 hover:underline mt-2 inline-block">
                  Rechercher une Ausbildung
                </Link>
              </div>
            ) : (
              conversations.map((conversation) => (
                <button
                  key={conversation.id}
                  type="button"
                  onClick={() => setSelectedId(conversation.id)}
                  className={`w-full p-4 text-left border-b border-slate-800/80 transition-colors ${
                    selectedId === conversation.id ? 'bg-blue-950/50' : 'hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-white line-clamp-1">
                      {conversation.jobOffer.company}
                    </p>
                    {conversation.unreadCount > 0 && (
                      <span className="min-w-5 h-5 px-1 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                        {conversation.unreadCount}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-300 line-clamp-1 mt-1">
                    {conversation.jobOffer.title}
                  </p>
                  <p className="text-[11px] text-slate-500 line-clamp-2 mt-2">
                    {conversation.lastMessage?.bodyText || 'En attente d’un premier message.'}
                  </p>
                  {conversation.lastMessage && (
                    <p className="text-[10px] text-slate-600 mt-2">
                      {new Date(conversation.lastMessage.sentAt).toLocaleString('fr-FR')}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="min-w-0 flex flex-col">
          {selected ? (
            <>
              <header className="min-h-16 px-4 md:px-6 py-3 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-400" />
                    {selected.jobOffer.company}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">{selected.jobOffer.title}</p>
                </div>
                <div className="text-[11px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {selected.jobOffer.location}
                  </span>
                </div>
              </header>

              {latestInbound?.aiSummary && (
                <div className="m-4 md:mx-6 md:mt-5 md:mb-0 rounded-2xl border border-indigo-800/60 bg-indigo-950/30 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold text-indigo-200 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400" />
                      Résumé intelligent de la dernière réponse
                    </p>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      latestInbound.replyType === 'INTERVIEW'
                        ? 'bg-amber-950/70 border-amber-700 text-amber-300'
                        : 'bg-slate-900 border-slate-700 text-slate-300'
                    }`}>
                      {replyTypeLabels[latestInbound.replyType || 'OTHER'] || 'Réponse reçue'}
                    </span>
                  </div>

                  <p className="text-sm leading-relaxed text-slate-100">
                    {latestInbound.aiSummary}
                  </p>

                  {(latestInbound.appointmentAt || latestInbound.appointmentLocation) && (
                    <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 p-3">
                      <p className="text-xs font-bold text-amber-300 flex items-center gap-2">
                        <CalendarDays className="w-4 h-4" />
                        Rendez-vous détecté
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-200">
                        {latestInbound.appointmentAt && (
                          <span className="inline-flex items-center gap-1">
                            <Clock3 className="w-3.5 h-3.5 text-amber-400" />
                            {new Date(latestInbound.appointmentAt).toLocaleString('fr-FR')}
                          </span>
                        )}
                        {latestInbound.appointmentLocation && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 text-amber-400" />
                            {latestInbound.appointmentLocation}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {latestActions.length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5 mb-1.5">
                        <ListChecks className="w-3.5 h-3.5 text-blue-400" />
                        Prochaines actions
                      </p>
                      <ul className="space-y-1">
                        {latestActions.map((action) => (
                          <li key={action} className="text-xs text-slate-300 flex gap-2">
                            <span className="text-blue-400">•</span>
                            <span>{action}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {latestLinks.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {latestLinks.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noreferrer nofollow"
                          className="max-w-full px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{link.label}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1 p-4 md:p-6 space-y-4 overflow-y-auto max-h-[470px] bg-slate-950/50">
                {selected.messages.length === 0 ? (
                  <div className="h-full min-h-52 flex flex-col items-center justify-center text-center">
                    <MessageSquare className="w-10 h-10 text-slate-700 mb-3" />
                    <p className="text-sm font-semibold text-slate-300">Aucun message enregistré</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Utilisez la zone ci-dessous pour contacter l’entreprise.
                    </p>
                  </div>
                ) : (
                  selected.messages.map((message) => {
                    const outbound = message.direction === 'OUTBOUND';
                    return (
                      <div
                        key={message.id}
                        className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[88%] md:max-w-[75%] rounded-2xl px-4 py-3 ${
                            outbound
                              ? 'bg-blue-600 text-white rounded-br-md'
                              : 'bg-slate-800 border border-slate-700 text-slate-100 rounded-bl-md'
                          }`}
                        >
                          <p className={`text-[10px] font-semibold mb-2 ${outbound ? 'text-blue-100' : 'text-slate-400'}`}>
                            {outbound ? `Envoyé à ${message.toEmail}` : `Reçu de ${message.fromEmail}`}
                          </p>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {message.bodyText}
                          </p>
                          <p className={`text-[10px] mt-2 text-right ${outbound ? 'text-blue-100' : 'text-slate-500'}`}>
                            {new Date(message.sentAt).toLocaleString('fr-FR')}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={sendReply} className="p-4 border-t border-slate-800 bg-slate-900">
                <textarea
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  rows={4}
                  maxLength={10_000}
                  placeholder="Écrivez votre réponse professionnelle…"
                  className="w-full resize-none px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                />
                <div className="flex items-center justify-between gap-3 mt-3">
                  <p className="text-[11px] text-slate-500">
                    La réponse sera envoyée par e-mail via votre SMTP.
                  </p>
                  <button
                    type="submit"
                    disabled={sending || !replyText.trim()}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold flex items-center gap-2 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    {sending ? 'Envoi...' : 'Envoyer'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Settings className="w-10 h-10 text-slate-700 mb-3" />
              <p className="text-sm font-semibold text-slate-300">Sélectionnez une candidature</p>
              <p className="text-xs text-slate-500 mt-1">
                La conversation et les réponses de l’entreprise apparaîtront ici.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
