'use client';

import React, { useState } from 'react';
import { Calendar as CalendarIcon, Clock, Building2, Video, MapPin, Plus, CheckCircle2 } from 'lucide-react';

export default function CalendarPage() {
  const [events, setEvents] = useState([
    {
      id: '1',
      title: 'Entretien : Software Engineer',
      company: 'SAP SE',
      date: '15 Août 2026',
      time: '10:00 - 11:00',
      type: 'En ligne (Microsoft Teams)',
      link: 'https://teams.microsoft.com',
      notes: 'Préparation: Présenter ses projets React et questions sur la technologie Cloud.',
    },
    {
      id: '2',
      title: 'Deuxième entretien : Operations Specialist',
      company: 'BMW Group München',
      date: '22 Août 2026',
      time: '14:00 - 15:30',
      type: 'Sur place (Usine de Munich)',
      link: '',
      notes: 'Apporter la carte d\'identité et les diplômes originaux.',
    },
  ]);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            <CalendarIcon className="w-3.5 h-3.5" /> Planning d'Entretiens & Rappels
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white">
            Calendrier des Entretiens
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Tous vos rendez-vous professionnels à venir en un coup d’œil
          </p>
        </div>

        <button className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-600/25">
          <Plus className="w-4 h-4" /> Ajouter un Événement
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Calendar Widget Info */}
        <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h3 className="font-bold text-white text-base border-b border-slate-800 pb-3">
            Prochants Rendez-vous
          </h3>
          <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-amber-400">
              <span>SAP SE</span>
              <span>Dans 21 jours</span>
            </div>
            <p className="text-xs text-white font-semibold">15 Août 2026 à 10:00</p>
            <p className="text-[11px] text-slate-300">Entretien via MS Teams</p>
          </div>
        </div>

        {/* Schedule List */}
        <div className="md:col-span-2 space-y-4">
          {events.map((event) => (
            <div key={event.id} className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl space-y-3 hover:border-blue-500/40 transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-950 px-2 py-0.5 rounded-md border border-blue-800/40">
                    Entretien d'embauche
                  </span>
                  <h3 className="text-base font-bold text-white mt-1">{event.title}</h3>
                  <p className="text-xs text-slate-400 font-medium flex items-center gap-1.5 mt-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-500" /> {event.company}
                  </p>
                </div>

                <div className="text-right text-xs">
                  <p className="font-bold text-white flex items-center gap-1"><CalendarIcon className="w-3.5 h-3.5 text-blue-400" /> {event.date}</p>
                  <p className="text-slate-400 flex items-center gap-1 mt-0.5"><Clock className="w-3.5 h-3.5 text-slate-500" /> {event.time}</p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
                <span className="flex items-center gap-1 text-slate-400">
                  <Video className="w-3.5 h-3.5 text-indigo-400" /> {event.type}
                </span>

                {event.link && (
                  <a href={event.link} target="_blank" rel="noreferrer" className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg">
                    Rejoindre la réunion
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
