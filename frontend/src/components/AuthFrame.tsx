'use client';

import { motion, useReducedMotion } from 'motion/react';
import { BrainCircuit, CheckCircle2, LockKeyhole, Search, Send, Sparkles } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

export default function AuthFrame({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070a12] text-white">
      <div className="noise-overlay" />
      <motion.div animate={reduceMotion ? undefined : { x: [0, 70, 0], y: [0, -40, 0] }} transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut' }} className="absolute -left-44 top-0 h-[38rem] w-[38rem] rounded-full bg-blue-600/20 blur-[120px]" />
      <motion.div animate={reduceMotion ? undefined : { x: [0, -50, 0], y: [0, 55, 0] }} transition={{ duration: 19, repeat: Infinity, ease: 'easeInOut' }} className="absolute -right-56 bottom-0 h-[40rem] w-[40rem] rounded-full bg-violet-600/20 blur-[130px]" />

      <div className="relative mx-auto grid min-h-screen max-w-[1500px] lg:grid-cols-[1.08fr_.92fr]">
        <section className="hidden flex-col justify-between p-10 lg:flex xl:p-16">
          <BrandLogo href="/" inverse />
          <div className="max-w-2xl py-16">
            <motion.div initial={reduceMotion ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-300"><Sparkles className="h-3.5 w-3.5" /> Un workspace pour votre avenir</motion.div>
            <motion.h2 initial={reduceMotion ? false : { opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="mt-7 text-5xl font-black leading-[1.04] tracking-[-0.055em] xl:text-6xl">Trouvez plus vite.<br /><span className="bg-gradient-to-r from-violet-400 via-blue-400 to-emerald-300 bg-clip-text text-transparent">Candidatez mieux.</span></motion.h2>
            <p className="mt-6 max-w-xl text-sm font-medium leading-7 text-slate-400">Azubora transforme votre profil et vos critères en un système de recherche, de candidature et de suivi parfaitement orchestré.</p>
            <div className="mt-10 grid max-w-xl grid-cols-3 gap-3">
              {[[Search, 'Recherche ciblée'], [BrainCircuit, 'Matching IA'], [Send, 'Envoi suivi']].map(([Icon, label], index) => { const FeatureIcon = Icon as typeof Search; return <motion.div key={String(label)} initial={reduceMotion ? false : { opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + index * 0.08 }} className="rounded-2xl border border-white/[0.07] bg-white/[0.045] p-4 backdrop-blur"><FeatureIcon className="h-5 w-5 text-blue-300" /><span className="mt-5 block text-[10px] font-black text-slate-300">{String(label)}</span></motion.div>; })}
            </div>
          </div>
          <div className="flex items-center gap-5 text-[10px] font-semibold text-slate-600"><span className="flex items-center gap-1.5"><LockKeyhole className="h-3.5 w-3.5" /> Données privées</span><span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Service indépendant</span></div>
        </section>

        <section className="flex min-h-screen items-center justify-center p-4 sm:p-8 lg:border-l lg:border-white/[0.07] lg:bg-white/[0.025]">
          <motion.div initial={reduceMotion ? false : { opacity: 0, y: 24, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }} className="w-full max-w-lg rounded-[2rem] border border-white/[0.09] bg-white/[0.065] p-6 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-9">
            <div className="mb-8 lg:hidden"><BrandLogo href="/" inverse /></div>
            <h1 className="text-3xl font-black tracking-[-0.04em] text-white">{title}</h1>
            <p className="mt-2 text-sm font-medium leading-6 text-slate-400">{description}</p>
            <div className="mt-8">{children}</div>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
