import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  BriefcaseBusiness,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Inbox,
  LockKeyhole,
  MessageSquareReply,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  ToggleRight,
  Upload,
  UserRoundCheck,
  Zap,
} from 'lucide-react';

const features = [
  {
    icon: Search,
    title: 'Recherche centralisée',
    description:
      'Explorez les offres d’emploi publiées dans le monde entier et filtrez-les par métier, ville et pays.',
    tone: 'blue',
  },
  {
    icon: Bot,
    title: 'Candidatures automatiques',
    description:
      'Activez le bot quand vous le souhaitez. Il sélectionne une offre compatible toutes les cinq minutes et prépare une candidature.',
    tone: 'violet',
  },
  {
    icon: FileText,
    title: 'E-mails personnalisés',
    description:
      'Chaque entreprise reçoit un message professionnel, sans faute, adapté à son offre et accompagné de votre CV.',
    tone: 'amber',
  },
  {
    icon: Inbox,
    title: 'Réponses au même endroit',
    description:
      'Consultez les réponses liées à vos candidatures et répondez depuis l’application : votre message est envoyé par e-mail.',
    tone: 'emerald',
  },
];

const steps = [
  {
    number: '01',
    icon: Upload,
    title: 'Complétez votre profil',
    description:
      'Ajoutez vos coordonnées, votre parcours, vos compétences et votre CV une seule fois.',
  },
  {
    number: '02',
    icon: SlidersHorizontal,
    title: 'Définissez vos critères',
    description:
      'Choisissez les métiers, les villes, les régions et les préférences qui comptent pour vous.',
  },
  {
    number: '03',
    icon: ToggleRight,
    title: 'Gardez le contrôle',
    description:
      'Lancez ou arrêtez l’automatisation en un clic et suivez chaque candidature envoyée.',
  },
];

const faqs = [
  {
    question: 'Est-ce que le bot peut être arrêté à tout moment ?',
    answer:
      'Oui. L’automatisation est entièrement contrôlée depuis vos paramètres. Lorsqu’elle est désactivée, aucune nouvelle candidature automatique n’est envoyée.',
  },
  {
    question: 'Mon CV est-il joint aux candidatures ?',
    answer:
      'Oui. Le CV enregistré dans votre profil est joint au message envoyé à l’entreprise. Les fichiers sont conservés dans un espace privé.',
  },
  {
    question: 'Les messages sont-ils identiques pour toutes les entreprises ?',
    answer:
      'Non. Le contenu est adapté au poste et à l’entreprise concernés, avec un style simple, professionnel et sans mise en page colorée.',
  },
  {
    question: 'Puis-je répondre aux recruteurs depuis la plateforme ?',
    answer:
      'Oui. Les conversations sont rattachées à chaque candidature. Une réponse rédigée dans l’application est envoyée par e-mail au recruteur.',
  },
];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-600/20">
        <Sparkles className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className={compact ? 'hidden sm:block' : ''}>
        <span className="block text-sm font-black tracking-tight text-slate-950">
          Global Job Finder
        </span>
        <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600">
          AI Assistant
        </span>
      </span>
    </span>
  );
}

export default function LandingPage() {
  return (
    <div className="landing-page min-h-screen overflow-hidden bg-[#f7f8fc] text-slate-950 selection:bg-blue-600 selection:text-white">
      <header className="sticky top-0 z-50 border-b border-slate-900/5 bg-[#f7f8fc]/85 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 py-3.5 sm:px-8">
          <Link href="/" aria-label="Global Job Finder AI — Accueil">
            <BrandMark />
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-600 lg:flex" aria-label="Navigation principale">
            <a href="#fonctionnalites" className="transition-colors hover:text-blue-600">
              Fonctionnalités
            </a>
            <a href="#fonctionnement" className="transition-colors hover:text-blue-600">
              Comment ça marche
            </a>
            <a href="#securite" className="transition-colors hover:text-blue-600">
              Sécurité
            </a>
            <a href="#faq" className="transition-colors hover:text-blue-600">
              Questions
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              href="/login"
              className="hidden rounded-xl px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-white hover:text-slate-950 sm:inline-flex"
            >
              Se connecter
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-slate-950/15 transition-all hover:-translate-y-0.5 hover:bg-blue-600"
            >
              Commencer
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative">
          <div className="pointer-events-none absolute inset-0 landing-grid opacity-60" />
          <div className="pointer-events-none absolute left-1/2 top-16 h-[520px] w-[760px] -translate-x-1/2 rounded-full bg-blue-300/25 blur-3xl" />

          <div className="relative mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[0.92fr_1.08fr] lg:pb-28 lg:pt-28">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-white/80 px-3.5 py-2 text-xs font-extrabold text-blue-700 shadow-sm">
                <Zap className="h-3.5 w-3.5 fill-blue-600" aria-hidden="true" />
                Votre recherche d’emploi, enfin organisée
              </div>

              <h1 className="max-w-2xl text-5xl font-black leading-[1.03] tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-[4.55rem]">
                Trouvez l’emploi qui{' '}
                <span className="relative whitespace-nowrap text-blue-600">
                  vous correspond.
                  <svg
                    className="absolute -bottom-2 left-0 w-full text-blue-300"
                    viewBox="0 0 260 12"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path d="M3 8.7C57 2.5 169 2 257 6" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                  </svg>
                </span>
              </h1>

              <p className="mt-7 max-w-xl text-lg font-medium leading-8 text-slate-600">
                Recherchez, personnalisez et suivez vos candidatures dans le monde entier depuis
                une seule plateforme. Activez l’automatisation uniquement quand vous le
                souhaitez.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 py-3.5 text-sm font-extrabold text-white shadow-xl shadow-blue-600/25 transition-all hover:-translate-y-0.5 hover:bg-blue-700"
                >
                  Créer mon espace
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <a
                  href="#fonctionnement"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-extrabold text-slate-800 shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
                >
                  Découvrir le fonctionnement
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>

              <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-slate-600">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Contrôle marche/arrêt
                </span>
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  CV joint automatiquement
                </span>
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Suivi des réponses
                </span>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-2xl">
              <div className="absolute -left-8 top-20 h-36 w-36 rounded-full bg-violet-400/20 blur-3xl" />
              <div className="absolute -right-8 bottom-8 h-44 w-44 rounded-full bg-blue-400/25 blur-3xl" />

              <div className="relative rounded-[2rem] border border-white/90 bg-white/80 p-2.5 shadow-[0_32px_90px_-30px_rgba(15,23,42,0.35)] backdrop-blur">
                <div className="overflow-hidden rounded-[1.55rem] border border-slate-200 bg-slate-950">
                  <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                    <div className="flex gap-1.5" aria-hidden="true">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">
                      Aperçu de votre espace
                    </span>
                    <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                  </div>

                  <div className="grid min-h-[430px] grid-cols-[58px_1fr] sm:grid-cols-[154px_1fr]">
                    <div className="border-r border-white/10 bg-slate-900 p-3 sm:p-4">
                      <div className="mb-7 flex items-center gap-2">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                          <Sparkles className="h-4 w-4" />
                        </span>
                        <span className="hidden text-xs font-black text-white sm:block">Global Jobs AI</span>
                      </div>
                      <div className="space-y-2">
                        {[
                          { icon: BriefcaseBusiness, label: 'Aperçu', active: true },
                          { icon: Search, label: 'Recherche' },
                          { icon: Send, label: 'Candidatures' },
                          { icon: Inbox, label: 'Messages' },
                          { icon: Settings2, label: 'Paramètres' },
                        ].map((item) => (
                          <div
                            key={item.label}
                            className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-[10px] font-bold ${
                              item.active ? 'bg-blue-600 text-white' : 'text-slate-500'
                            }`}
                          >
                            <item.icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="hidden sm:block">{item.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-50 p-4 sm:p-6">
                      <div className="mb-5 flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-blue-600">Bonjour Amine</p>
                          <h2 className="mt-1 text-lg font-black text-slate-950">Votre recherche avance</h2>
                        </div>
                        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                          </span>
                          <span className="hidden text-[10px] font-black text-emerald-700 sm:block">Auto-apply activé</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                          <Clock3 className="mb-2 h-4 w-4 text-blue-600" />
                          <p className="text-[10px] font-semibold text-slate-500">Prochain envoi</p>
                          <p className="mt-0.5 text-sm font-black text-slate-950">dans 5 min</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3">
                          <MessageSquareReply className="mb-2 h-4 w-4 text-violet-600" />
                          <p className="text-[10px] font-semibold text-slate-500">Nouveau message</p>
                          <p className="mt-0.5 text-sm font-black text-slate-950">1 réponse</p>
                        </div>
                      </div>

                      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3.5">
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-xs font-black text-slate-950">Offres sélectionnées</p>
                          <span className="text-[10px] font-bold text-blue-600">Voir tout</span>
                        </div>
                        <div className="space-y-2.5">
                          {[
                            ['Software Engineer', 'Northstar Labs', 'Toronto', '94%'],
                            ['Product Designer', 'Atlas Studio', 'Paris', '88%'],
                            ['Operations Manager', 'Horizon Group', 'Dubai', '82%'],
                          ].map(([role, company, city, match]) => (
                            <div key={company} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5">
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white">
                                <Building2 className="h-4 w-4 text-slate-600" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-[11px] font-black text-slate-900">{role}</p>
                                <p className="truncate text-[9px] font-semibold text-slate-500">{company} · {city}</p>
                              </div>
                              <span className="rounded-md bg-emerald-100 px-1.5 py-1 text-[9px] font-black text-emerald-700">
                                {match}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-7 -left-3 hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xl sm:flex">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                  <Check className="h-5 w-5 stroke-[3]" />
                </span>
                <span>
                  <span className="block text-[10px] font-semibold text-slate-500">Candidature envoyée</span>
                  <span className="block text-xs font-black text-slate-950">CV inclus · message adapté</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-5 px-5 py-7 text-center sm:px-8 lg:flex-row lg:text-left">
            <p className="max-w-lg text-sm font-bold leading-6 text-slate-500">
              Une seule interface pour passer de la recherche à la conversation avec l’entreprise.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs font-extrabold text-slate-700">
              <span className="inline-flex items-center gap-2"><Search className="h-4 w-4 text-blue-600" /> Recherche</span>
              <span className="inline-flex items-center gap-2"><UserRoundCheck className="h-4 w-4 text-blue-600" /> Personnalisation</span>
              <span className="inline-flex items-center gap-2"><Send className="h-4 w-4 text-blue-600" /> Envoi SMTP</span>
              <span className="inline-flex items-center gap-2"><Inbox className="h-4 w-4 text-blue-600" /> Messagerie</span>
            </div>
          </div>
        </section>

        <section id="fonctionnalites" className="scroll-mt-20 bg-white px-5 py-24 sm:px-8 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Tout au même endroit</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">
                Moins de tâches répétitives.<br />Plus de candidatures pertinentes.
              </h2>
              <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-7 text-slate-600">
                La plateforme automatise le travail administratif tout en vous laissant décider
                des critères et du moment où elle agit.
              </p>
            </div>

            <div className="mt-14 grid gap-5 md:grid-cols-2">
              {features.map((feature) => {
                const tones: Record<string, string> = {
                  blue: 'bg-blue-100 text-blue-700',
                  violet: 'bg-violet-100 text-violet-700',
                  amber: 'bg-amber-100 text-amber-700',
                  emerald: 'bg-emerald-100 text-emerald-700',
                };
                return (
                  <article
                    key={feature.title}
                    className="group rounded-3xl border border-slate-200 bg-slate-50 p-7 transition-all hover:-translate-y-1 hover:border-blue-200 hover:bg-white hover:shadow-xl hover:shadow-slate-900/5 sm:p-9"
                  >
                    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tones[feature.tone]}`}>
                      <feature.icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-6 text-xl font-black text-slate-950">{feature.title}</h3>
                    <p className="mt-3 max-w-lg text-sm font-medium leading-7 text-slate-600">{feature.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="fonctionnement" className="scroll-mt-20 bg-slate-950 px-5 py-24 text-white sm:px-8 lg:py-32">
          <div className="mx-auto max-w-7xl">
            <div className="grid gap-14 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-400">Simple à configurer</p>
                <h2 className="mt-4 text-4xl font-black tracking-[-0.035em] sm:text-5xl">
                  Prêt en trois étapes.
                </h2>
                <p className="mt-5 max-w-md text-base font-medium leading-7 text-slate-400">
                  Votre profil devient la base de candidatures cohérentes, adaptées et faciles à suivre.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {steps.map((step) => (
                  <article key={step.number} className="rounded-3xl border border-white/10 bg-white/[0.045] p-6">
                    <div className="flex items-center justify-between">
                      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600 text-white">
                        <step.icon className="h-5 w-5" />
                      </span>
                      <span className="text-xs font-black tracking-widest text-slate-600">{step.number}</span>
                    </div>
                    <h3 className="mt-7 text-base font-black">{step.title}</h3>
                    <p className="mt-3 text-sm font-medium leading-6 text-slate-400">{step.description}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white px-5 py-24 sm:px-8 lg:py-32">
          <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:items-center">
            <div className="relative overflow-hidden rounded-[2rem] bg-blue-600 p-7 text-white shadow-2xl shadow-blue-600/20 sm:p-10">
              <div className="absolute -right-12 -top-16 h-52 w-52 rounded-full border-[35px] border-white/10" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-black">Automatisation</span>
                  <ToggleRight className="h-9 w-9" />
                </div>
                <h3 className="mt-12 max-w-sm text-3xl font-black tracking-tight">Vous décidez quand le bot travaille.</h3>
                <p className="mt-4 max-w-md text-sm font-medium leading-7 text-blue-100">
                  Les filtres restent sous votre contrôle. Une fois activé, le bot applique votre stratégie à intervalle régulier.
                </p>
                <div className="mt-8 rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-blue-600">
                        <Bot className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block text-sm font-black">Auto-apply</span>
                        <span className="block text-xs font-semibold text-blue-100">Une candidature toutes les 5 minutes</span>
                      </span>
                    </div>
                    <span className="relative h-7 w-12 rounded-full bg-emerald-400 shadow-inner">
                      <span className="absolute right-1 top-1 h-5 w-5 rounded-full bg-white shadow" />
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:pl-10">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Une candidature complète</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.035em] text-slate-950 sm:text-5xl">
                Un message adapté.<br />Votre CV joint.
              </h2>
              <p className="mt-5 max-w-xl text-base font-medium leading-7 text-slate-600">
                Chaque envoi reste simple et professionnel. L’entreprise reçoit les informations utiles, sans design coloré ni texte générique.
              </p>
              <ul className="mt-7 space-y-4">
                {[
                  'Objet clair et adapté au poste',
                  'Texte professionnel dans la langue configurée',
                  'CV privé joint automatiquement',
                  'Historique conservé dans vos candidatures',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3 text-sm font-bold text-slate-700">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                      <Check className="h-3.5 w-3.5 stroke-[3]" />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section id="securite" className="scroll-mt-20 border-y border-slate-200 bg-slate-50 px-5 py-20 sm:px-8">
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <LockKeyhole className="h-5 w-5" />
              </span>
              <h2 className="mt-6 text-3xl font-black tracking-tight text-slate-950">Vos données restent les vôtres.</h2>
              <p className="mt-4 max-w-lg text-sm font-medium leading-7 text-slate-600">
                Les comptes sont isolés, les sessions sont protégées et les identifiants de messagerie ne sont jamais exposés dans l’interface.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['CV privé', 'Votre document n’est pas publié comme un fichier public.'],
                ['Sessions sécurisées', 'Les cookies de connexion sont protégés en production.'],
                ['Accès isolé', 'Chaque utilisateur accède uniquement à ses propres données.'],
                ['SMTP chiffré', 'Les mots de passe de messagerie sont chiffrés au stockage.'],
              ].map(([title, description]) => (
                <article key={title} className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start gap-3">
                    <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                    <div>
                      <h3 className="text-sm font-black text-slate-950">{title}</h3>
                      <p className="mt-1.5 text-xs font-medium leading-5 text-slate-500">{description}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 bg-white px-5 py-24 sm:px-8 lg:py-32">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-600">Questions fréquentes</p>
              <h2 className="mt-4 text-4xl font-black tracking-[-0.035em] text-slate-950">
                Avant de commencer.
              </h2>
              <p className="mt-5 text-sm font-medium leading-7 text-slate-600">
                Les points essentiels pour utiliser l’automatisation en toute confiance.
              </p>
            </div>
            <div className="divide-y divide-slate-200 border-y border-slate-200">
              {faqs.map((faq) => (
                <details key={faq.question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-sm font-black text-slate-950">
                    {faq.question}
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-lg font-medium text-slate-500 transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="max-w-2xl pt-3 text-sm font-medium leading-7 text-slate-600">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 pb-24 sm:px-8">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.25rem] bg-slate-950 px-6 py-16 text-center text-white sm:px-12 sm:py-20">
            <div className="pointer-events-none absolute left-1/2 top-0 h-80 w-80 -translate-x-1/2 rounded-full bg-blue-600/35 blur-3xl" />
            <div className="relative">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600">
                <Sparkles className="h-5 w-5" />
              </span>
              <h2 className="mx-auto mt-6 max-w-3xl text-4xl font-black tracking-[-0.04em] sm:text-5xl">
                Votre prochain emploi commence par une meilleure recherche.
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-sm font-medium leading-7 text-slate-400">
                Créez votre profil, choisissez vos villes et gérez toutes vos candidatures depuis un espace unique.
              </p>
              <Link
                href="/register"
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-black text-slate-950 transition-all hover:-translate-y-0.5 hover:bg-blue-50"
              >
                Créer mon compte
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white px-5 py-10 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-8">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
            <Link href="/" aria-label="Global Job Finder AI — Accueil">
              <BrandMark />
            </Link>
            <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs font-bold text-slate-500">
              <a href="#fonctionnalites" className="hover:text-blue-600">Fonctionnalités</a>
              <a href="#fonctionnement" className="hover:text-blue-600">Fonctionnement</a>
              <a href="#securite" className="hover:text-blue-600">Sécurité</a>
              <Link href="/login" className="hover:text-blue-600">Connexion</Link>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-3 border-t border-slate-200 pt-6 text-[11px] font-medium leading-5 text-slate-400 sm:flex-row">
            <p>© 2026 Global Job Finder AI. Tous droits réservés.</p>
            <p className="max-w-2xl sm:text-right">
              Service indépendant utilisant des sources d’offres tierces. Les candidatures restent soumises aux conditions de chaque fournisseur.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
