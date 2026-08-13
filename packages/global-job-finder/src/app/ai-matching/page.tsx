'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { 
  BrainCircuit, 
  Sparkles, 
  FileText, 
  Download, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Lightbulb, 
  Building2, 
  Send,
  Copy,
  Printer,
  Check,
  Briefcase,
  Edit3,
  CheckCheck
} from 'lucide-react';

function AIMatchingContent() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId') || '';

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Editable Offer Details for Standard / Custom Mode
  const [companyName, setCompanyName] = useState('SAP SE');
  const [jobTitle, setJobTitle] = useState('Software Engineer');
  const [tone, setTone] = useState<'compact' | 'professional' | 'enthusiastic' | 'creative'>('compact');

  // AI Analysis Results
  const [matchScore, setMatchScore] = useState<number>(88);
  const [matchingSkills, setMatchingSkills] = useState<string[]>(['TypeScript', 'Mathématiques', 'Esprit d\'équipe']);
  const [missingSkills, setMissingSkills] = useState<string[]>(['Docker', 'Bases des API REST']);
  const [cvTips, setCvTips] = useState<string[]>([
    'Mentionnez vos projets web dans un court paragraphe du CV.',
    'Mettez en avant votre motivation pour cette entreprise.',
  ]);

  // Generated Cover Letter (Short, concise & job-tailored)
  const [coverLetter, setCoverLetter] = useState<string>(`Dear Hiring Team,

I am writing to apply for the Software Engineer position at your company. The role strongly interests me because it aligns with my experience and professional goals.

My background includes practical experience with JavaScript, TypeScript and Python, together with strong teamwork and communication skills. I am reliable, motivated and committed to producing high-quality work.

I would welcome the opportunity to discuss my application. My CV is attached for your review.

Kind regards,

Alex Morgan`);

  const fetchJobAndAnalysis = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobOfferId: jobId }),
      });
      const data = await res.json();
      if (data.analysis) {
        setMatchScore(data.analysis.matchScore);
        setMatchingSkills(data.analysis.matchingSkills || []);
        setMissingSkills(data.analysis.missingSkills || []);
        setCvTips(data.analysis.cvSuggestions || []);
      }
    } catch (err) {
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateCoverLetter = async (customComp = companyName, customTitle = jobTitle) => {
    setGenerating(true);
    try {
      const res = await fetch('/api/ai/cover-letter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobOfferId: jobId,
          companyName: customComp,
          jobTitle: customTitle,
          tone,
        }),
      });
      const data = await res.json();
      if (data.coverLetter) {
        setCoverLetter(data.coverLetter);
        if (data.jobTitle) setJobTitle(data.jobTitle);
        if (data.companyName) setCompanyName(data.companyName);
      }
    } catch (err) {
    } finally {
      setGenerating(false);
    }
  };

  const loadStandardMasterTemplate = () => {
    const stdCompany = '[Company name]';
    const stdTitle = '[Job title]';
    setCompanyName(stdCompany);
    setJobTitle(stdTitle);
    handleGenerateCoverLetter(stdCompany, stdTitle);
  };

  useEffect(() => {
    if (jobId) {
      fetchJobAndAnalysis();
      handleGenerateCoverLetter();
    }
  }, [jobId]);

  const handleCopyText = () => {
    navigator.clipboard.writeText(coverLetter);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handlePrintPdf = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Professional Application Letter</title>
            <style>
              body { font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; padding: 40px; color: #111; max-width: 800px; margin: 0 auto; }
              pre { font-family: inherit; white-space: pre-wrap; word-wrap: break-word; }
            </style>
          </head>
          <body>
            <pre>${coverLetter}</pre>
            <script>window.print();</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            <BrainCircuit className="w-3.5 h-3.5" /> Moteur d'Intelligence Artificielle
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white">
            Matching IA & e-mail de candidature
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Générez une lettre courte, universelle ou ciblée sur n'importe quelle offre d'emploi
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadStandardMasterTemplate}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 transition-all"
          >
            <FileText className="w-4 h-4 text-emerald-400" />
            <span>Charger Modèle Standard Universal</span>
          </button>
          <button
            onClick={fetchJobAndAnalysis}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Recalculer le Match Score</span>
          </button>
        </div>
      </div>

      {/* Top Grid: Match Score & Skill Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Match Score Ring */}
        <div className="bg-gradient-to-br from-blue-950/40 via-slate-900 to-indigo-950/40 border border-blue-800/40 p-6 rounded-2xl flex flex-col items-center justify-center text-center">
          <div className="relative w-36 h-36 flex items-center justify-center mb-3">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-800"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-blue-500"
                strokeDasharray={`${matchScore}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold text-white">{matchScore}%</span>
              <span className="text-[10px] text-blue-400 font-bold uppercase">Score Match</span>
            </div>
          </div>

          <h3 className="text-sm font-bold text-white mb-1">Excellente Compatibilité</h3>
          <p className="text-xs text-slate-400">Profil adapté aux exigences de l'offre</p>
        </div>

        {/* Matching vs Missing Skills */}
        <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Compétences Validées
          </h3>
          <div className="flex flex-wrap gap-2">
            {matchingSkills.map((s, i) => (
              <span key={i} className="px-2.5 py-1 bg-emerald-950/80 text-emerald-300 border border-emerald-800/50 rounded-lg text-xs font-semibold">
                ✓ {s}
              </span>
            ))}
          </div>

          <h3 className="text-sm font-bold text-white flex items-center gap-2 pt-2 border-t border-slate-800">
            <AlertTriangle className="w-4 h-4 text-amber-400" /> Compétences Recommandées
          </h3>
          <div className="flex flex-wrap gap-2">
            {missingSkills.map((s, i) => (
              <span key={i} className="px-2.5 py-1 bg-amber-950/80 text-amber-300 border border-amber-800/50 rounded-lg text-xs font-semibold">
                ! {s}
              </span>
            ))}
          </div>
        </div>

        {/* CV Improvement Suggestions */}
        <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl space-y-3">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-yellow-400" /> Recommandations IA
          </h3>
          <ul className="space-y-2 text-xs text-slate-300">
            {cvTips.map((tip, idx) => (
              <li key={idx} className="p-2.5 bg-slate-950 rounded-xl border border-slate-800/80 leading-relaxed flex items-start gap-2">
                <span className="text-blue-400 font-bold">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Target Offer Customizer Bar */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-white">
          <Edit3 className="w-4 h-4 text-blue-400" /> Personnaliser l'E-mail pour une Offre Spécifique :
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Nom de l'Entreprise</label>
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="ex: SAP SE, BMW AG..."
                className="bg-transparent text-white text-xs focus:outline-none w-full"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Intitulé du poste</label>
            <div className="flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800">
              <Briefcase className="w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                placeholder="ex. Software Engineer, Product Designer…"
                className="bg-transparent text-white text-xs focus:outline-none w-full"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => handleGenerateCoverLetter(companyName, jobTitle)}
              disabled={generating}
              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-md transition-all"
            >
              <Sparkles className={`w-3.5 h-3.5 ${generating ? 'animate-spin' : ''}`} />
              <span>Mettre à jour la Lettre</span>
            </button>
          </div>
        </div>
      </div>

      {/* Application letter editor */}
      <div className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" /> Lettre de motivation professionnelle
            </h3>
            <p className="text-xs text-emerald-400 font-semibold mt-0.5">
              ✓ Format court, concis et 100% prêt à être envoyé par E-mail
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={tone}
              onChange={(e: any) => setTone(e.target.value)}
              className="bg-slate-950 text-slate-200 border border-slate-800 rounded-xl px-3 py-2 text-xs font-medium focus:outline-none"
            >
              <option value="compact">Style: Court & Concis (Recommandé)</option>
              <option value="professional">Style: Formel & Professionnel</option>
              <option value="enthusiastic">Style: Enthousiaste & Dynamique</option>
            </select>

            <button
              onClick={handleCopyText}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all"
            >
              {copied ? (
                <>
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copié !</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copier le Texte</span>
                </>
              )}
            </button>

            <button
              onClick={handlePrintPdf}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>

        {/* Anschreiben Text Area */}
        <textarea
          rows={14}
          value={coverLetter}
          onChange={(e) => setCoverLetter(e.target.value)}
          className="w-full p-6 bg-slate-950 border border-slate-800 rounded-2xl text-slate-100 font-mono text-sm leading-relaxed focus:outline-none focus:border-blue-500 shadow-inner"
        />
      </div>
    </div>
  );
}

export default function AIMatchingPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400">Chargement du modèle d'e-mail standard...</div>}>
      <AIMatchingContent />
    </Suspense>
  );
}
