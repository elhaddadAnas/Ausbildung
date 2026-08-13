'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  FileText, 
  Send, 
  Calendar, 
  CheckCircle2, 
  XCircle, 
  Bookmark, 
  Plus, 
  Building2, 
  MapPin, 
  Trash2, 
  Clock, 
  MessageSquare,
  ChevronRight
} from 'lucide-react';

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/applications');
      const data = await res.json();
      if (data.applications) setApplications(data.applications);
    } catch (err) {}
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  const updateStatus = async (appId: string, newStatus: string) => {
    try {
      const res = await fetch('/api/applications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: appId, status: newStatus }),
      });
      if (res.ok) fetchApplications();
    } catch (err) {}
  };

  const deleteApplication = async (appId: string) => {
    await fetch(`/api/applications?id=${appId}`, { method: 'DELETE' });
    setApplications(prev => prev.filter(a => a.id !== appId));
  };

  const columns = [
    { key: 'SAVED', title: 'Enregistrés', color: 'border-slate-700 bg-slate-900/60', icon: Bookmark },
    { key: 'APPLIED', title: 'Postulés', color: 'border-blue-800 bg-blue-950/30', icon: Send },
    { key: 'INTERVIEW', title: 'Entretiens', color: 'border-amber-800 bg-amber-950/30', icon: Calendar },
    { key: 'OFFER', title: 'Offres / Restés', color: 'border-emerald-800 bg-emerald-950/30', icon: CheckCircle2 },
    { key: 'REJECTED', title: 'Refusés', color: 'border-rose-900 bg-rose-950/20', icon: XCircle },
  ];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            <FileText className="w-3.5 h-3.5" /> Suivi du Pipeline de Candidatures
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white">
            Gestionnaire des Candidatures
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Suivez l’état de vos candidatures en temps réel
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/search"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-lg"
          >
            <Plus className="w-4 h-4" /> Nouvelle Candidature
          </Link>
        </div>
      </div>

      {/* Kanban Board Grid */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 overflow-x-auto pb-4">
        {columns.map((col) => {
          const colApps = applications.filter(a => a.status === col.key);
          const ColIcon = col.icon;

          return (
            <div key={col.key} className={`border rounded-2xl p-4 flex flex-col min-h-[500px] ${col.color}`}>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <ColIcon className="w-4 h-4 text-slate-300" />
                  <h3 className="font-bold text-white text-xs">{col.title}</h3>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-800 text-slate-300">
                  {colApps.length}
                </span>
              </div>

              <div className="space-y-3 flex-1">
                {colApps.map((app) => (
                  <div
                    key={app.id}
                    className="p-4 bg-slate-950 border border-slate-800 hover:border-blue-500/40 rounded-xl space-y-3 shadow-md group transition-all"
                  >
                    <div>
                      <h4 className="font-bold text-white text-xs leading-snug group-hover:text-blue-400 transition-colors">
                        {app.jobOffer?.title || 'poste'}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                        <Building2 className="w-3 h-3 text-slate-500" /> {app.jobOffer?.company || 'Entreprise'}
                      </p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> {app.jobOffer?.location || 'le monde'}
                      </p>
                    </div>

                    {app.matchScore && (
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Match IA:</span>
                        <span className="font-bold text-blue-400 bg-blue-950 px-2 py-0.5 rounded-md border border-blue-800/40">
                          {app.matchScore}% Score
                        </span>
                      </div>
                    )}

                    {/* Quick Move Status Buttons */}
                    <div className="pt-2 border-t border-slate-900 flex items-center justify-between gap-1 text-[10px]">
                      <select
                        value={app.status}
                        onChange={(e) => updateStatus(app.id, e.target.value)}
                        className="bg-slate-900 text-slate-300 border border-slate-800 rounded px-1.5 py-1 text-[10px] focus:outline-none"
                      >
                        <option value="SAVED">Enregistré</option>
                        <option value="APPLIED">Postulé</option>
                        <option value="INTERVIEW">Entretien</option>
                        <option value="OFFER">Offre</option>
                        <option value="REJECTED">Refusé</option>
                      </select>

                      <button
                        onClick={() => deleteApplication(app.id)}
                        className="text-slate-500 hover:text-rose-400 p-1"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {app.status !== 'SAVED' && (
                      <Link
                        href={`/messages?applicationId=${app.id}`}
                        className="w-full py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-blue-400 text-[11px] font-bold flex items-center justify-center gap-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        Ouvrir la conversation
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
