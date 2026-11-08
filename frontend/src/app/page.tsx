'use client';

import Link from 'next/link';
import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react';
import {
  ArrowRight,
  BadgeCheck,
  Bot,
  BrainCircuit,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Clock3,
  Coins,
  FileCheck2,
  FileText,
  Inbox,
  MailCheck,
  MessageSquareReply,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Upload,
  WandSparkles,
} from 'lucide-react';
import BrandLogo, { BrandMark } from '@/components/BrandLogo';

const capabilities = [
  'Matching IA', 'Recherche Allemagne', 'CV intelligent', 'Auto-candidature',
  'Planning flexible', 'E-mails personnalisés', 'Suivi des réponses', 'Crédits à la demande',
];

const faqs = [
  ['Est-ce que je garde le contrôle sur les envois ?', 'Oui. Vous activez ou désactivez l’auto-candidature à tout moment, définissez les métiers, villes, régions, jours et horaires autorisés.'],
  ['Le message est-il personnalisé pour chaque entreprise ?', 'Oui. Azubora analyse l’offre et votre profil pour générer un message professionnel adapté au poste et à l’entreprise.'],
  ['Mon CV est-il joint automatiquement ?', 'Oui. Le CV privé enregistré dans votre profil est joint à chaque candidature envoyée via votre configuration SMTP.'],
  ['Que se passe-t-il quand mes crédits sont terminés ?', 'Vous pouvez passer à une formule supérieure ou acheter un pack de crédits qui reste disponible jusqu’à son utilisation.'],
];

const reveal = {
  hidden: { opacity: 0, y: 28 },
  visible: { opacity: 1, y: 0 },
};

export default function LandingPage() {
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.3 });

  return (
    <div className="landing-page min-h-screen overflow-hidden bg-[#f7f8fc] text-[#111827]">
      <motion.div className="fixed inset-x-0 top-0 z-[80] h-[2px] origin-left bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-400" style={{ scaleX: progress }} />

      <header className="fixed inset-x-0 top-0 z-50 px-4 pt-4 sm:px-6">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center justify-between rounded-2xl border border-white/80 bg-white/75 px-4 shadow-[0_18px_60px_-35px_rgba(15,23,42,0.35)] backdrop-blur-2xl sm:px-5">
          <BrandLogo href="/" lightSurface />
          <nav className="hidden items-center gap-7 text-xs font-bold text-slate-600 lg:flex" aria-label="Navigation principale">
            <a href="#plateforme" className="transition hover:text-blue-600">Plateforme</a>
            <a href="#automatisation" className="transition hover:text-blue-600">Automatisation</a>
            <a href="#tarifs" className="transition hover:text-blue-600">Tarifs</a>
            <a href="#faq" className="transition hover:text-blue-600">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-xl px-4 py-2.5 text-xs font-black text-slate-700 transition hover:bg-slate-100 sm:inline-flex">Connexion</Link>
            <Link href="/register" className="group inline-flex items-center gap-2 rounded-xl bg-[#101522] px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-blue-600">
              Démarrer <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative min-h-screen overflow-hidden px-4 pb-24 pt-32 sm:px-6 sm:pt-40">
          <div className="landing-grid pointer-events-none absolute inset-0" />
          <div className="noise-overlay" />
          <motion.div animate={reduceMotion ? undefined : { x: [0, 55, 0], y: [0, -30, 0] }} transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }} className="pointer-events-none absolute -left-36 top-16 h-[34rem] w-[34rem] rounded-full bg-violet-300/25 blur-[110px]" />
          <motion.div animate={reduceMotion ? undefined : { x: [0, -45, 0], y: [0, 42, 0] }} transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut' }} className="pointer-events-none absolute -right-44 top-40 h-[38rem] w-[38rem] rounded-full bg-cyan-300/25 blur-[120px]" />

          <div className="relative mx-auto max-w-7xl text-center">
            <motion.div initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="mx-auto inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/80 px-3.5 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-blue-700 shadow-sm backdrop-blur">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative h-2 w-2 rounded-full bg-emerald-500" /></span>
              Votre recherche travaille avec vous
            </motion.div>

            <motion.h1 initial={reduceMotion ? false : { opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.7, ease: [0.22, 1, 0.36, 1] }} className="mx-auto mt-7 max-w-5xl text-[3.25rem] font-black leading-[0.98] tracking-[-0.065em] text-slate-950 sm:text-7xl lg:text-[6.3rem]">
              L’Ausbildung idéale.<br /><span className="aurora-text">En mode autopilote.</span>
            </motion.h1>

            <motion.p initial={false} animate={{ opacity: 1, y: 0 }} className="mx-auto mt-7 max-w-2xl text-base font-medium leading-7 text-slate-600 sm:text-lg sm:leading-8">
              Azubora recherche, analyse et prépare des candidatures personnalisées en Allemagne—pendant que vous gardez le contrôle sur chaque critère.
            </motion.p>

            <motion.div initial={false} animate={{ opacity: 1, y: 0 }} className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/register" className="group inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 via-blue-600 to-blue-500 px-6 py-4 text-sm font-black text-white shadow-[0_18px_45px_-16px_rgba(79,109,245,0.65)] transition hover:-translate-y-1 sm:w-auto">
                Créer mon espace gratuitement <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <a href="#plateforme" className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-6 py-4 text-sm font-black text-slate-800 shadow-sm backdrop-blur transition hover:-translate-y-1 hover:shadow-lg sm:w-auto">
                Voir la plateforme <ChevronRight className="h-4 w-4" />
              </a>
            </motion.div>

            <motion.div initial={false} animate={{ opacity: 1 }} className="mt-7 flex flex-wrap justify-center gap-x-6 gap-y-2 text-[11px] font-bold text-slate-500">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Formule gratuite disponible</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Activation à votre rythme</span>
              <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Données privées</span>
            </motion.div>

            <HeroProduct reduceMotion={Boolean(reduceMotion)} />
          </div>
        </section>

        <section className="border-y border-slate-200/80 bg-white py-5">
          <div className="overflow-hidden">
            <div className="marquee-track flex items-center">
              {[...capabilities, ...capabilities].map((item, index) => (
                <div key={`${item}-${index}`} className="flex items-center gap-5 px-5 text-[11px] font-black uppercase tracking-[0.15em] text-slate-400 sm:px-8">
                  {item}<Sparkles className="h-3.5 w-3.5 text-blue-400" />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="plateforme" className="scroll-mt-24 px-4 py-24 sm:px-6 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <SectionHeading eyebrow="Une plateforme, tout le parcours" title="De la première recherche à la première réponse." description="Un workspace conçu autour de votre progression, avec l’intelligence artificielle au bon endroit—jamais entre vous et vos décisions." />

            <div className="mt-14 grid auto-rows-[260px] gap-5 md:grid-cols-2 lg:grid-cols-3">
              <BentoCard className="md:col-span-2 lg:row-span-2" icon={Search} title="Explorez toute l’Allemagne" description="Filtrez les offres par métier, ville, Land, rayon et télétravail. Enregistrez les meilleures ou lancez une analyse IA." dark>
                <div className="mt-7 overflow-hidden rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="flex gap-2 rounded-xl border border-white/10 bg-white/[0.06] p-3 text-left text-xs text-slate-400"><Search className="h-4 w-4 text-blue-400" /> Fachinformatiker <span className="ml-auto rounded-md bg-white/5 px-2">Berlin + 25 km</span></div>
                  <div className="mt-3 space-y-2">
                    {[['Fachinformatiker/in', 'Nexa Digital GmbH', '96%'], ['Kaufmann/-frau Digital', 'Nordstern AG', '89%'], ['IT-Systemelektroniker/in', 'Voltwerk GmbH', '84%']].map(([role, company, score]) => (
                      <div key={company} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.04] p-3 text-left">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300"><Building2 className="h-4 w-4" /></span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-black text-white">{role}</span><span className="mt-1 block text-[10px] text-slate-500">{company} · Berlin</span></span>
                        <span className="rounded-lg bg-emerald-400/10 px-2 py-1 text-[10px] font-black text-emerald-300">{score}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </BentoCard>

              <BentoCard icon={BrainCircuit} title="Matching qui explique" description="Un score, les compétences communes, les écarts et des recommandations CV concrètes.">
                <div className="mt-6 flex items-end gap-2"><span className="text-5xl font-black tracking-tighter text-slate-950">92</span><span className="mb-1 text-sm font-black text-emerald-500">% match</span></div>
                <div className="mt-3 h-2 rounded-full bg-slate-100"><div className="h-full w-[92%] rounded-full bg-gradient-to-r from-blue-500 to-emerald-400" /></div>
              </BentoCard>

              <BentoCard icon={FileText} title="Chaque message est unique" description="Une candidature sobre, professionnelle et contextualisée, avec votre CV en pièce jointe.">
                <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left text-[10px] leading-5 text-slate-500"><span className="font-black text-slate-800">Betreff:</span> Bewerbung um einen Ausbildungsplatz…<br />Sehr geehrte Damen und Herren…</div>
              </BentoCard>

              <BentoCard icon={Inbox} title="Réponses centralisées" description="Synchronisez vos échanges, repérez les entretiens et répondez depuis Azubora." className="md:col-span-2 lg:col-span-1">
                <div className="mt-5 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-left"><MailCheck className="h-5 w-5 text-emerald-600" /><span><span className="block text-xs font-black text-slate-900">Invitation à un entretien</span><span className="text-[10px] text-slate-500">Détectée et ajoutée au calendrier</span></span></div>
              </BentoCard>
            </div>
          </div>
        </section>

        <section id="automatisation" className="relative scroll-mt-24 overflow-hidden bg-[#090d18] px-4 py-24 text-white sm:px-6 lg:py-32">
          <div className="noise-overlay opacity-30" />
          <div className="absolute left-1/2 top-0 h-[32rem] w-[52rem] -translate-x-1/2 rounded-full bg-blue-600/20 blur-[130px]" />
          <div className="relative mx-auto grid max-w-7xl gap-16 lg:grid-cols-[0.82fr_1.18fr] lg:items-center">
            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={reveal} transition={{ duration: 0.65 }}>
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/20 bg-blue-400/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-blue-300"><Bot className="h-3.5 w-3.5" /> Auto-candidature intelligente</span>
              <h2 className="mt-6 text-4xl font-black leading-tight tracking-[-0.045em] sm:text-5xl">Programmez votre rythme.<br /><span className="text-slate-500">Azubora suit le plan.</span></h2>
              <p className="mt-6 max-w-xl text-sm font-medium leading-7 text-slate-400">Sélectionnez les jours et une plage horaire. Hors planning, aucune candidature automatique n’est lancée. Une limite SMTP arrête le bot immédiatement.</p>
              <ul className="mt-8 space-y-4">
                {['Métiers, villes, Länder et rayon personnalisables', 'Score IA minimum avant candidature', 'Jours et horaires configurables', 'Interrupteur marche/arrêt instantané'].map((item) => <li key={item} className="flex items-center gap-3 text-sm font-bold text-slate-300"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-400/10 text-emerald-300"><Check className="h-3.5 w-3.5" /></span>{item}</li>)}
              </ul>
            </motion.div>

            <AutomationPanel reduceMotion={Boolean(reduceMotion)} />
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <SectionHeading eyebrow="Votre parcours, orchestré" title="Trois étapes. Un système qui reste simple." description="Azubora rassemble votre profil, votre stratégie et vos échanges dans un flux clair." />
            <div className="relative mt-14 grid gap-5 lg:grid-cols-3">
              <div className="absolute left-[16%] right-[16%] top-11 hidden h-px bg-gradient-to-r from-blue-200 via-violet-300 to-emerald-200 lg:block" />
              {[
                ['01', Upload, 'Construisez votre profil', 'Importez votre CV, vérifiez les informations extraites et complétez vos préférences.'],
                ['02', SlidersHorizontal, 'Définissez votre stratégie', 'Choisissez les métiers, zones, jours et horaires de recherche.'],
                ['03', CircleGauge, 'Suivez les résultats', 'Pilotez les candidatures, messages, entretiens et prochaines actions depuis un dashboard.'],
              ].map(([number, Icon, title, description], index) => {
                const StepIcon = Icon as typeof Upload;
                return <motion.article key={String(number)} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={reveal} transition={{ delay: index * 0.12 }} className="relative rounded-3xl border border-slate-200 bg-white p-7 shadow-[0_20px_60px_-42px_rgba(15,23,42,0.35)]"><span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-xl"><StepIcon className="h-5 w-5" /></span><span className="absolute right-6 top-6 text-xs font-black tracking-[0.2em] text-slate-300">{String(number)}</span><h3 className="mt-7 text-lg font-black text-slate-950">{String(title)}</h3><p className="mt-3 text-sm font-medium leading-6 text-slate-500">{String(description)}</p></motion.article>;
              })}
            </div>
          </div>
        </section>

        <section id="tarifs" className="scroll-mt-24 border-y border-slate-200 bg-white px-4 py-24 sm:px-6 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <SectionHeading eyebrow="Transparent dès le départ" title="Commencez gratuitement. Accélérez quand vous voulez." description="Des quotas clairs, des crédits complémentaires sans expiration mensuelle et aucune confusion sur ce qui est inclus." />
            <div className="mt-14 grid gap-5 lg:grid-cols-3">
              <PriceCard name="Découverte" price="0 €" detail="pour démarrer" items={['5 candidatures / mois', '50 crédits IA', 'Recherche et suivi', 'Envoi SMTP manuel']} />
              <PriceCard name="Plus" price="9,99 €" detail="par mois" featured items={['60 candidatures / mois', '1 000 crédits IA', 'Auto-candidature planifiée', 'Analyse des réponses']} />
              <PriceCard name="Pro" price="19,99 €" detail="par mois" items={['250 candidatures / mois', '5 000 crédits IA', 'Automatisation intensive', 'Recherche multi-villes']} />
            </div>
            <div className="mt-5 flex flex-col items-center justify-between gap-4 rounded-3xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-blue-50 to-emerald-50 p-6 text-center sm:flex-row sm:text-left">
              <div className="flex items-center gap-4"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-indigo-600 shadow-sm"><Coins className="h-5 w-5" /></span><span><span className="block text-sm font-black text-slate-950">Besoin de crédits sans changer de formule ?</span><span className="mt-1 block text-xs font-medium text-slate-500">Packs disponibles dès 2,99 €—conservés jusqu’à leur utilisation.</span></span></div>
              <Link href="/register" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-xs font-black text-indigo-600 shadow-sm transition hover:-translate-y-0.5">Voir les options <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </div>
        </section>

        <section className="px-4 py-24 sm:px-6 lg:py-32">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
            <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 p-8 text-white sm:p-10">
              <div className="noise-overlay" /><ShieldCheck className="relative h-9 w-9" /><h2 className="relative mt-8 max-w-lg text-3xl font-black tracking-tight sm:text-4xl">Vos données méritent une architecture sérieuse.</h2><p className="relative mt-5 max-w-xl text-sm font-medium leading-7 text-blue-100">Sessions protégées, comptes isolés, identifiants SMTP chiffrés et CV conservé dans un espace privé.</p>
              <div className="relative mt-8 grid grid-cols-2 gap-3">{['CV privé', 'SMTP chiffré', 'Sessions sécurisées', 'Accès isolé'].map((item) => <div key={item} className="rounded-xl border border-white/15 bg-white/10 p-3 text-xs font-black backdrop-blur">{item}</div>)}</div>
            </div>
            <div id="faq" className="scroll-mt-24 rounded-[2rem] border border-slate-200 bg-white p-7 sm:p-10">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-600">Questions fréquentes</p><h2 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Tout ce qu’il faut savoir.</h2>
              <div className="mt-7 divide-y divide-slate-200">{faqs.map(([question, answer]) => <details key={question} className="group py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-sm font-black text-slate-900">{question}<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-medium text-slate-500 transition group-open:rotate-45">+</span></summary><p className="pr-10 pt-3 text-xs font-medium leading-6 text-slate-500">{answer}</p></details>)}</div>
            </div>
          </div>
        </section>

        <section className="px-4 pb-24 sm:px-6">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-[#090d18] px-6 py-20 text-center text-white sm:px-12">
            <div className="noise-overlay" /><div className="absolute left-1/2 top-0 h-72 w-96 -translate-x-1/2 rounded-full bg-blue-500/30 blur-[100px]" />
            <div className="relative"><BrandMark className="mx-auto h-14 w-14" /><h2 className="mx-auto mt-7 max-w-3xl text-4xl font-black tracking-[-0.05em] sm:text-6xl">Votre avenir n’attend pas.<br /><span className="text-blue-400">Votre recherche non plus.</span></h2><p className="mx-auto mt-6 max-w-xl text-sm font-medium leading-7 text-slate-400">Créez votre espace et transformez une recherche dispersée en un système clair, personnel et actif.</p><Link href="/register" className="group mt-9 inline-flex items-center gap-2 rounded-2xl bg-white px-6 py-4 text-sm font-black text-slate-950 transition hover:-translate-y-1 hover:bg-blue-50">Commencer avec Azubora <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></Link></div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-4 py-10 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-col gap-8"><div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center"><BrandLogo href="/" lightSurface /><div className="flex flex-wrap gap-6 text-xs font-bold text-slate-500"><a href="#plateforme">Plateforme</a><a href="#automatisation">Automatisation</a><a href="#tarifs">Tarifs</a><Link href="/login">Connexion</Link></div></div><div className="flex flex-col justify-between gap-3 border-t border-slate-200 pt-6 text-[10px] font-medium leading-5 text-slate-400 sm:flex-row"><p>© 2026 Azubora. Tous droits réservés.</p><p>Service indépendant sans affiliation officielle avec la Bundesagentur für Arbeit.</p></div></div>
      </footer>
    </div>
  );
}

function HeroProduct({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <motion.div initial={false} animate={{ opacity: 1, y: 0, scale: 1 }} className="relative mx-auto mt-16 max-w-5xl text-left">
      <motion.div animate={reduceMotion ? undefined : { y: [0, -8, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} className="relative rounded-[2rem] border border-white bg-white/70 p-2.5 shadow-[0_45px_110px_-42px_rgba(30,41,59,0.55)] backdrop-blur-xl">
        <div className="overflow-hidden rounded-[1.55rem] border border-slate-200 bg-[#0b1020]">
          <div className="flex h-12 items-center justify-between border-b border-white/[0.07] px-4"><div className="flex gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-400" /><i className="h-2.5 w-2.5 rounded-full bg-amber-400" /><i className="h-2.5 w-2.5 rounded-full bg-emerald-400" /></div><div className="rounded-lg bg-white/[0.04] px-4 py-1.5 text-[9px] font-bold text-slate-500">app.azubora.de/dashboard</div><ShieldCheck className="h-4 w-4 text-emerald-400" /></div>
          <div className="grid min-h-[440px] grid-cols-[64px_1fr] sm:grid-cols-[190px_1fr]">
            <div className="border-r border-white/[0.07] bg-[#090d18] p-3 sm:p-4"><BrandMark className="mb-7 h-9 w-9" /><div className="space-y-2">{[[CircleGauge,'Overview'],[Search,'Recherche'],[WandSparkles,'Studio IA'],[Send,'Candidatures'],[Inbox,'Messages']].map(([Icon,label], index) => { const NavIcon = Icon as typeof Search; return <div key={String(label)} className={`flex items-center gap-2 rounded-xl p-2.5 text-[10px] font-bold ${index === 0 ? 'bg-gradient-to-r from-violet-500/25 to-blue-500/20 text-white' : 'text-slate-600'}`}><NavIcon className="h-3.5 w-3.5" /><span className="hidden sm:block">{String(label)}</span></div>; })}</div></div>
            <div className="min-w-0 bg-[#0d1324] p-4 sm:p-6"><div className="flex items-start justify-between"><div><p className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-400">Bonjour Yasmine</p><p className="mt-1 text-base font-black text-white sm:text-xl">Votre recherche avance</p></div><span className="flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-400/10 px-2.5 py-2 text-[9px] font-black text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Actif</span></div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{[[BriefcaseBusiness,'Offres suivies','128'],[Send,'Candidatures','24'],[MessageSquareReply,'Réponses','6']].map(([Icon,label,value]) => { const CardIcon = Icon as typeof Search; return <div key={String(label)} className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3"><CardIcon className="h-4 w-4 text-blue-400" /><p className="mt-4 text-xl font-black text-white">{String(value)}</p><p className="text-[9px] font-medium text-slate-500">{String(label)}</p></div>; })}</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1.4fr_.8fr]"><div className="rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4"><div className="flex items-center justify-between"><p className="text-xs font-black text-white">Matches récents</p><span className="text-[9px] font-bold text-blue-400">Voir tout</span></div><div className="mt-3 space-y-2">{[['Fachinformatiker/in','Nexa GmbH','94%'],['Mechatroniker/in','Kraftwerk AG','88%']].map(([role,company,score]) => <div key={company} className="flex items-center gap-3 rounded-xl bg-black/15 p-2.5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10"><Building2 className="h-3.5 w-3.5 text-blue-300" /></span><span className="min-w-0 flex-1"><span className="block truncate text-[10px] font-black text-white">{role}</span><span className="block truncate text-[8px] text-slate-500">{company} · Berlin</span></span><span className="text-[9px] font-black text-emerald-300">{score}</span></div>)}</div></div><div className="rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 p-4"><BrainCircuit className="h-5 w-5 text-white" /><p className="mt-7 text-xs font-black text-white">Studio IA</p><p className="mt-1 text-[9px] leading-4 text-blue-100">Analysez une offre et créez votre lettre.</p><span className="mt-4 inline-flex rounded-lg bg-white px-2.5 py-1.5 text-[8px] font-black text-blue-600">Créer</span></div></div>
            </div>
          </div>
        </div>
      </motion.div>
      <motion.div animate={reduceMotion ? undefined : { y: [0, -10, 0], rotate: [-1, 1, -1] }} transition={{ duration: 5.5, repeat: Infinity }} className="absolute -left-4 top-28 hidden items-center gap-3 rounded-2xl border border-white bg-white/90 p-3 shadow-xl backdrop-blur md:flex"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600"><FileCheck2 className="h-4 w-4" /></span><span><span className="block text-[9px] font-medium text-slate-500">Candidature envoyée</span><span className="text-[10px] font-black text-slate-900">CV + message personnalisé</span></span></motion.div>
      <motion.div animate={reduceMotion ? undefined : { y: [0, 9, 0] }} transition={{ duration: 4.8, repeat: Infinity }} className="absolute -right-4 bottom-16 hidden items-center gap-3 rounded-2xl border border-white bg-white/90 p-3 shadow-xl backdrop-blur md:flex"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-600"><CalendarClock className="h-4 w-4" /></span><span><span className="block text-[9px] font-medium text-slate-500">Prochain passage</span><span className="text-[10px] font-black text-slate-900">Aujourd’hui · 14:03</span></span></motion.div>
    </motion.div>
  );
}

function SectionHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-80px' }} variants={reveal} transition={{ duration: 0.65 }} className="mx-auto max-w-3xl text-center"><p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600">{eyebrow}</p><h2 className="mt-4 text-4xl font-black leading-tight tracking-[-0.045em] text-slate-950 sm:text-5xl">{title}</h2><p className="mx-auto mt-5 max-w-2xl text-sm font-medium leading-7 text-slate-500 sm:text-base">{description}</p></motion.div>;
}

function BentoCard({ icon: Icon, title, description, children, className = '', dark = false }: { icon: typeof Search; title: string; description: string; children: React.ReactNode; className?: string; dark?: boolean }) {
  return <motion.article initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-70px' }} variants={reveal} transition={{ duration: 0.6 }} whileHover={{ y: -5 }} className={`group relative overflow-hidden rounded-[1.75rem] border p-6 ${dark ? 'border-slate-800 bg-[#0b1020] text-white shadow-2xl' : 'border-slate-200 bg-white text-slate-950 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)]'} ${className}`}><div className={`absolute -right-20 -top-20 h-52 w-52 rounded-full blur-3xl transition-opacity group-hover:opacity-90 ${dark ? 'bg-blue-500/20' : 'bg-blue-100'}`} /><span className={`relative flex h-11 w-11 items-center justify-center rounded-2xl ${dark ? 'bg-white/10 text-blue-300' : 'bg-blue-50 text-blue-600'}`}><Icon className="h-5 w-5" /></span><h3 className="relative mt-5 text-lg font-black">{title}</h3><p className={`relative mt-2 max-w-xl text-xs font-medium leading-6 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{description}</p><div className="relative">{children}</div></motion.article>;
}

function AutomationPanel({ reduceMotion }: { reduceMotion: boolean }) {
  return <motion.div initial={reduceMotion ? false : { opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-80px' }} transition={{ duration: 0.7 }} className="rounded-[2rem] border border-white/10 bg-white/[0.055] p-3 shadow-2xl backdrop-blur-xl sm:p-5"><div className="rounded-[1.4rem] border border-white/[0.07] bg-[#0b1020] p-5 sm:p-7"><div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500"><Bot className="h-5 w-5" /></span><span><span className="block text-sm font-black">Auto-candidature</span><span className="text-[10px] text-slate-500">Planification active</span></span></div><span className="relative h-8 w-14 rounded-full bg-emerald-400 shadow-[0_0_30px_rgba(52,211,153,.25)]"><span className="absolute right-1 top-1 h-6 w-6 rounded-full bg-white shadow" /></span></div><div className="my-6 h-px bg-white/[0.07]" /><div className="grid gap-4 sm:grid-cols-2"><div><p className="text-[9px] font-black uppercase tracking-wider text-slate-600">Jours actifs</p><div className="mt-3 flex gap-1.5">{['L','M','M','J','V','S','D'].map((day,index) => <span key={`${day}-${index}`} className={`flex h-8 w-8 items-center justify-center rounded-lg text-[9px] font-black ${index < 5 ? 'bg-blue-500 text-white' : 'bg-white/5 text-slate-600'}`}>{day}</span>)}</div></div><div><p className="text-[9px] font-black uppercase tracking-wider text-slate-600">Fenêtre d’exécution</p><div className="mt-3 flex items-center gap-2"><span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black">08:00</span><span className="text-slate-600">→</span><span className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black">15:00</span></div></div></div><div className="mt-6 rounded-2xl border border-white/[0.07] bg-black/20 p-4"><div className="mb-4 flex items-center justify-between"><span className="text-[10px] font-black text-white">Aujourd’hui</span><span className="flex items-center gap-1.5 text-[9px] font-bold text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> En cours</span></div><div className="relative h-2 rounded-full bg-white/[0.06]"><motion.div initial={{ width: 0 }} whileInView={{ width: '68%' }} viewport={{ once: true }} transition={{ duration: 1.2, delay: 0.3 }} className="h-full rounded-full bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-400" /><span className="absolute left-[68%] top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-[#0b1020] bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,.7)]" /></div><div className="mt-3 flex justify-between text-[8px] font-bold text-slate-600"><span>08:00</span><span>11:00</span><span>15:00</span></div></div><div className="mt-4 flex items-center gap-3 rounded-2xl border border-blue-400/10 bg-blue-400/[0.06] p-3"><Clock3 className="h-4 w-4 text-blue-300" /><span className="text-[10px] text-slate-400"><strong className="text-white">Rythme :</strong> maximum une candidature toutes les 3 minutes</span></div></div></motion.div>;
}

function PriceCard({ name, price, detail, items, featured = false }: { name: string; price: string; detail: string; items: string[]; featured?: boolean }) {
  return <motion.article initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-60px' }} variants={reveal} whileHover={{ y: -6 }} className={`relative rounded-[1.75rem] border p-7 ${featured ? 'border-blue-500 bg-[#0b1020] text-white shadow-[0_30px_80px_-35px_rgba(79,109,245,.65)]' : 'border-slate-200 bg-white text-slate-950'}`}>{featured && <span className="absolute right-5 top-5 rounded-full bg-blue-500 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-white">Recommandé</span>}<p className={`text-xs font-black uppercase tracking-wider ${featured ? 'text-blue-300' : 'text-slate-400'}`}>{name}</p><p className="mt-5 text-4xl font-black tracking-tight">{price}</p><p className={`mt-1 text-[10px] font-bold ${featured ? 'text-slate-500' : 'text-slate-400'}`}>{detail}</p><ul className="my-7 space-y-3">{items.map((item) => <li key={item} className={`flex items-center gap-2.5 text-xs font-semibold ${featured ? 'text-slate-300' : 'text-slate-600'}`}><BadgeCheck className={`h-4 w-4 ${featured ? 'text-emerald-300' : 'text-emerald-500'}`} />{item}</li>)}</ul><Link href="/register" className={`flex items-center justify-center rounded-xl px-4 py-3 text-xs font-black transition ${featured ? 'bg-white text-slate-950 hover:bg-blue-50' : 'bg-slate-100 text-slate-900 hover:bg-slate-950 hover:text-white'}`}>Choisir {name}</Link></motion.article>;
}
