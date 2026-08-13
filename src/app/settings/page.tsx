'use client';

import React, { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, 
  Mail, 
  Bell, 
  ShieldCheck, 
  Check, 
  AlertCircle, 
  RefreshCw,
  ExternalLink,
  Info,
  KeyRound,
  Power,
  Clock3,
  MapPin,
  BriefcaseBusiness,
  Play
} from 'lucide-react';

function autoApplyResultSummary(rawResult: string): string {
  try {
    const result = JSON.parse(rawResult);
    if (Number(result.sent) > 0) {
      return `${result.sent} candidature(s) envoyée(s), ${result.skipped || 0} offre(s) ignorée(s).`;
    }
    return result.noSendReason ||
      `${result.checked || 0} offre(s) vérifiée(s), aucune nouvelle candidature envoyée.`;
  } catch {
    return rawResult;
  }
}

const AUTO_APPLY_DAYS = [
  { value: 1, label: 'Lun' },
  { value: 2, label: 'Mar' },
  { value: 3, label: 'Mer' },
  { value: 4, label: 'Jeu' },
  { value: 5, label: 'Ven' },
  { value: 6, label: 'Sam' },
  { value: 0, label: 'Dim' },
];

function minuteToTime(value: number): string {
  const hours = Math.floor(value / 60).toString().padStart(2, '0');
  const minutes = (value % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

function timeToMinute(value: string): number {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export default function SettingsPage() {
  const [savingSmtp, setSavingSmtp] = useState(false);
  const [testingSmtp, setTestingSmtp] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);
  const [savingAutoApply, setSavingAutoApply] = useState(false);
  const [runningAutoApply, setRunningAutoApply] = useState(false);

  const [smtpMsg, setSmtpMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [notifMsg, setNotifMsg] = useState<{ text: string; error: boolean } | null>(null);
  const [autoApplyMsg, setAutoApplyMsg] = useState<{ text: string; error: boolean } | null>(null);

  // SMTP Settings State
  const [provider, setProvider] = useState<'gmail' | 'outlook' | 'custom'>('gmail');
  const [host, setHost] = useState('smtp.gmail.com');
  const [port, setPort] = useState(587);
  const [secure, setSecure] = useState(false);
  const [authUser, setAuthUser] = useState('');
  const [authPass, setAuthPass] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('Ausbildung Finder AI');
  const [smtpActive, setSmtpActive] = useState(true);
  const [smtpTested, setSmtpTested] = useState(false);
  const [hasSavedPassword, setHasSavedPassword] = useState(false);
  const [imapHost, setImapHost] = useState('imap.gmail.com');
  const [imapPort, setImapPort] = useState(993);
  const [imapSecure, setImapSecure] = useState(true);
  const [imapActive, setImapActive] = useState(true);

  // Auto-apply State
  const [autoApplyEnabled, setAutoApplyEnabled] = useState(false);
  const [autoKeywords, setAutoKeywords] = useState('Ausbildung');
  const [autoCities, setAutoCities] = useState('');
  const [autoFederalStates, setAutoFederalStates] = useState('');
  const [autoCategories, setAutoCategories] = useState('');
  const [autoRadiusKm, setAutoRadiusKm] = useState(25);
  const [autoRemoteOnly, setAutoRemoteOnly] = useState(false);
  const [autoMinMatchScore, setAutoMinMatchScore] = useState(60);
  const [autoScheduleDays, setAutoScheduleDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [autoScheduleStart, setAutoScheduleStart] = useState('08:00');
  const [autoScheduleEnd, setAutoScheduleEnd] = useState('15:00');
  const [autoScheduleTimezone, setAutoScheduleTimezone] = useState('Europe/Berlin');
  const [autoLastRunAt, setAutoLastRunAt] = useState<string | null>(null);
  const [autoNextRunAt, setAutoNextRunAt] = useState<string | null>(null);
  const [autoLastResult, setAutoLastResult] = useState('');

  // Notifications State
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramChatId, setTelegramChatId] = useState('');
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [whatsappEnabled, setWhatsappEnabled] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState('');

  useEffect(() => {
    fetch('/api/settings/smtp')
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Les paramètres SMTP n’ont pas pu être chargés.');
        return data;
      })
      .then(data => {
        if (data.smtp) {
          setProvider(data.smtp.provider || 'gmail');
          setHost(data.smtp.host || 'smtp.gmail.com');
          setPort(data.smtp.port || 587);
          setSecure(data.smtp.secure || false);
          setAuthUser(data.smtp.authUser || '');
          setFromEmail(data.smtp.fromEmail || '');
          setFromName(data.smtp.fromName || 'Ausbildung Finder AI');
          setSmtpActive(data.smtp.active ?? true);
          setSmtpTested(data.smtp.isTested ?? false);
          setImapHost(data.smtp.imapHost || (data.smtp.provider === 'outlook' ? 'outlook.office365.com' : 'imap.gmail.com'));
          setImapPort(data.smtp.imapPort || 993);
          setImapSecure(data.smtp.imapSecure ?? true);
          setImapActive(data.smtp.imapActive ?? true);
          setHasSavedPassword(true);
        }
      })
      .catch(error => setSmtpMsg({
        text: error instanceof Error ? error.message : 'Les paramètres SMTP n’ont pas pu être chargés.',
        error: true,
      }));

    fetch('/api/settings/notifications')
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Les notifications n’ont pas pu être chargées.');
        return data;
      })
      .then(data => {
        if (data.config) {
          setEmailEnabled(data.config.emailEnabled ?? true);
          setTelegramEnabled(data.config.telegramEnabled ?? false);
          setTelegramChatId(data.config.telegramChatId || '');
          setDiscordEnabled(data.config.discordEnabled ?? false);
          setDiscordWebhookUrl(data.config.discordWebhookUrl || '');
          setWhatsappEnabled(data.config.whatsappEnabled ?? false);
          setWhatsappNumber(data.config.whatsappNumber || '');
        }
      })
      .catch(error => setNotifMsg({
        text: error instanceof Error ? error.message : 'Les notifications n’ont pas pu être chargées.',
        error: true,
      }));

    fetch('/api/settings/auto-apply')
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Les paramètres automatiques n’ont pas pu être chargés.');
        return data;
      })
      .then(data => {
        if (data.config) {
          const config = data.config;
          setAutoApplyEnabled(config.enabled ?? false);
          setAutoKeywords((config.keywords || []).join(', '));
          setAutoCities((config.cities || []).join(', '));
          setAutoFederalStates((config.federalStates || []).join(', '));
          setAutoCategories((config.categories || []).join(', '));
          setAutoRadiusKm(config.radiusKm ?? 25);
          setAutoRemoteOnly(config.remoteOnly ?? false);
          setAutoMinMatchScore(config.minMatchScore ?? 60);
          setAutoScheduleDays(config.scheduleDays || [1, 2, 3, 4, 5]);
          setAutoScheduleStart(minuteToTime(config.scheduleStartMinute ?? 480));
          setAutoScheduleEnd(minuteToTime(config.scheduleEndMinute ?? 900));
          setAutoScheduleTimezone(config.scheduleTimezone || 'Europe/Berlin');
          setAutoLastRunAt(config.lastRunAt || null);
          setAutoNextRunAt(config.nextRunAt || null);
          setAutoLastResult(config.lastResult || '');
        }
      })
      .catch(error => setAutoApplyMsg({
        text: error instanceof Error ? error.message : 'Les paramètres automatiques n’ont pas pu être chargés.',
        error: true,
      }));
  }, []);

  const handleProviderSelect = (selectedProvider: 'gmail' | 'outlook' | 'custom') => {
    setProvider(selectedProvider);
    setSmtpMsg(null);
    if (selectedProvider === 'gmail') {
      setHost('smtp.gmail.com');
      setPort(587);
      setSecure(false);
      setImapHost('imap.gmail.com');
      setImapPort(993);
      setImapSecure(true);
    } else if (selectedProvider === 'outlook') {
      setHost('smtp.office365.com');
      setPort(587);
      setSecure(false);
      setImapHost('outlook.office365.com');
      setImapPort(993);
      setImapSecure(true);
    } else {
      setImapHost('');
      setImapPort(993);
      setImapSecure(true);
    }
  };

  const handleTestSmtp = async () => {
    setTestingSmtp(true);
    setSmtpMsg(null);

    try {
      const res = await fetch('/api/settings/smtp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test',
          saveOnSuccess: true,
          provider,
          host,
          port,
          secure,
          authUser,
          authPass,
          fromEmail: fromEmail || authUser,
          fromName,
          active: smtpActive,
          imapHost,
          imapPort,
          imapSecure,
          imapActive,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSmtpMsg({ text: data.message || 'Connexion réussie !', error: false });
        setSmtpTested(Boolean(data.savedConfigurationTested));
        setHasSavedPassword(true);
        if (provider !== 'custom') setFromEmail(authUser);
      } else {
        // Display exact server error message returned by testSMTPConnection
        setSmtpMsg({ text: data.message || data.error || 'Erreur lors du test de connexion', error: true });
        if (data.autoApplyStopped) {
          setAutoApplyEnabled(false);
          setAutoNextRunAt(null);
          setAutoLastResult(JSON.stringify({
            smtpHalted: true,
            smtpHaltReason: data.message || data.error,
          }));
        }
      }
    } catch {
      setSmtpMsg({ text: 'Erreur réseau lors du test SMTP.', error: true });
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleSaveSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSmtp(true);
    setSmtpMsg(null);

    try {
      const res = await fetch('/api/settings/smtp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          provider,
          host,
          port,
          secure,
          authUser,
          authPass,
          fromEmail: fromEmail || authUser,
          fromName,
          active: smtpActive,
          imapHost,
          imapPort,
          imapSecure,
          imapActive,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setSmtpMsg({ text: 'Paramètres SMTP enregistrés avec succès !', error: false });
        setHasSavedPassword(true);
        setSmtpTested(data.smtp?.isTested ?? false);
        if (data.smtp?.fromEmail) setFromEmail(data.smtp.fromEmail);
        if (data.smtp?.active === false || data.smtp?.isTested === false) {
          setAutoApplyEnabled(false);
          setAutoNextRunAt(null);
        }
      } else {
        setSmtpMsg({ text: data.error || "Échec de l'enregistrement.", error: true });
      }
    } catch {
      setSmtpMsg({ text: "Erreur lors de l'enregistrement SMTP.", error: true });
    } finally {
      setSavingSmtp(false);
    }
  };

  const autoApplyPayload = (enabled = autoApplyEnabled) => ({
    enabled,
    keywords: autoKeywords,
    cities: autoCities,
    federalStates: autoFederalStates,
    categories: autoCategories,
    radiusKm: autoRadiusKm,
    remoteOnly: autoRemoteOnly,
    minMatchScore: autoMinMatchScore,
    scheduleDays: autoScheduleDays,
    scheduleStartMinute: timeToMinute(autoScheduleStart),
    scheduleEndMinute: timeToMinute(autoScheduleEnd),
    scheduleTimezone: autoScheduleTimezone,
  });

  const saveAutoApply = async (enabled = autoApplyEnabled) => {
    const previousEnabled = autoApplyEnabled;
    setSavingAutoApply(true);
    setAutoApplyMsg(null);
    try {
      const res = await fetch('/api/settings/auto-apply', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(autoApplyPayload(enabled)),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Enregistrement impossible.');
      setAutoApplyEnabled(data.config.enabled);
      setAutoLastRunAt(data.config.lastRunAt || null);
      setAutoNextRunAt(data.config.nextRunAt || null);
      setAutoLastResult(data.config.lastResult || '');
      setAutoApplyMsg({
        text: data.config.enabled
          ? 'Auto-candidature activée selon votre planning.'
          : 'Auto-candidature désactivée.',
        error: false,
      });
    } catch (error: any) {
      setAutoApplyEnabled(previousEnabled);
      setAutoApplyMsg({ text: error.message || 'Erreur auto-candidature.', error: true });
    } finally {
      setSavingAutoApply(false);
    }
  };

  const toggleAutoApply = async () => {
    await saveAutoApply(!autoApplyEnabled);
  };

  const runAutoApplyNow = async () => {
    setRunningAutoApply(true);
    setAutoApplyMsg(null);
    try {
      const saveRes = await fetch('/api/settings/auto-apply', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(autoApplyPayload(autoApplyEnabled)),
      });
      const saveData = await saveRes.json();
      if (!saveRes.ok) throw new Error(saveData.error || 'Enregistrement impossible.');

      const res = await fetch('/api/settings/auto-apply', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data.smtpHalted) {
          setAutoApplyEnabled(false);
          setAutoNextRunAt(null);
          setAutoLastResult(JSON.stringify(data));
        }
        throw new Error(data.smtpHaltReason || data.error || data.noSendReason || 'Exécution impossible.');
      }
      setAutoLastRunAt(data.lastRunAt || new Date().toISOString());
      setAutoNextRunAt(data.nextRunAt || null);
      setAutoLastResult(JSON.stringify(data));
      setAutoApplyMsg({
        text: data.sent > 0
          ? `${data.sent} candidature(s) envoyée(s), ${data.skipped || 0} offre(s) ignorée(s).`
          : data.noSendReason || `${data.checked || 0} offre(s) vérifiée(s), aucune nouvelle candidature envoyée.`,
        error: false,
      });
    } catch (error: any) {
      setAutoApplyMsg({ text: error.message || 'Erreur pendant l’exécution.', error: true });
    } finally {
      setRunningAutoApply(false);
    }
  };

  const handleSaveNotifications = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingNotif(true);
    setNotifMsg(null);

    try {
      const res = await fetch('/api/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          emailEnabled,
          telegramEnabled,
          telegramChatId,
          discordEnabled,
          discordWebhookUrl,
          whatsappEnabled,
          whatsappNumber,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setNotifMsg({ text: 'Préférences de notifications enregistrées !', error: false });
      } else {
        setNotifMsg({ text: data.error || "Erreur d'enregistrement.", error: true });
      }
    } catch {
      setNotifMsg({ text: 'Erreur système.', error: true });
    } finally {
      setSavingNotif(false);
    }
  };

  const smtpAutoSendHalt = (() => {
    if (!autoLastResult) return '';
    try {
      const result = JSON.parse(autoLastResult);
      if (!result?.smtpHalted) return '';
      return String(
        result.smtpHaltReason ||
        result.error ||
        'Une limite SMTP a été détectée. Vérifiez votre compte avant de réactiver.'
      );
    } catch {
      return '';
    }
  })();

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
          <SettingsIcon className="w-3.5 h-3.5" /> Configuration & E-mail
        </div>
        <h1 className="text-2xl md:text-3xl font-extrabold text-white">
          Paramètres E-mail, SMTP & Réponses
        </h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Configurez l’envoi des candidatures et la réception des réponses dans l’application
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left 2 Cols: SMTP Server Configuration */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSaveSmtp} className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl space-y-6 shadow-xl">
            <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-400" /> Configuration SMTP et boîte de réception
            </h3>

            {smtpMsg && (
              <div className={`p-4 rounded-xl text-xs flex items-start gap-2.5 shadow-lg ${
                smtpMsg.error 
                  ? 'bg-rose-950/80 border border-rose-800 text-rose-200' 
                  : 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
              }`}>
                {smtpMsg.error ? <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" /> : <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                <div className="space-y-1">
                  <p className="font-semibold">{smtpMsg.text}</p>
                </div>
              </div>
            )}

            {/* Provider Tabs */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Fournisseurs E-mail Prédéfinis</label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => handleProviderSelect('gmail')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                    provider === 'gmail'
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Gmail SMTP
                </button>
                <button
                  type="button"
                  onClick={() => handleProviderSelect('outlook')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                    provider === 'outlook'
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Outlook / Office365
                </button>
                <button
                  type="button"
                  onClick={() => handleProviderSelect('custom')}
                  className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all ${
                    provider === 'custom'
                      ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-600/30'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Serveur SMTP Personnalisé
                </button>
              </div>
            </div>

            {/* Special Gmail Guide */}
            {provider === 'gmail' && (
              <div className="p-4 bg-blue-950/40 border border-blue-800/60 rounded-xl space-y-3 text-xs text-blue-200">
                <div className="flex items-center gap-2 font-bold text-blue-300">
                  <KeyRound className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>Procédure Google Gmail (Mot de Passe d'Application) :</span>
                </div>

                <div className="space-y-2 text-[11px] text-slate-300">
                  <p>
                    <strong>Étape 1 :</strong> Activez d'abord la validation en 2 étapes sur votre compte Google :<br />
                    👉 <a href="https://myaccount.google.com/signinoptions/two-step-verification" target="_blank" rel="noreferrer" className="text-blue-400 font-bold underline inline-flex items-center gap-1">
                      myaccount.google.com/signinoptions/two-step-verification <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>

                  <p>
                    <strong>Étape 2 :</strong> Générez le Mot de Passe d'Application (16 caractères) :<br />
                    👉 <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-blue-400 font-bold underline inline-flex items-center gap-1">
                      myaccount.google.com/apppasswords <ExternalLink className="w-3 h-3" />
                    </a>
                  </p>
                </div>
              </div>
            )}

            {/* Special Outlook / Office365 Guide */}
            {provider === 'outlook' && (
              <div className="p-4 bg-indigo-950/40 border border-indigo-800/60 rounded-xl space-y-2 text-xs text-indigo-200">
                <div className="flex items-center gap-2 font-bold text-indigo-300">
                  <Info className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span>Configuration Outlook / Office365 (smtp.office365.com) :</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  L'hôte officiel est <strong>smtp.office365.com</strong> sur le port <strong>587</strong>. 
                  Si vous avez activé la sécurité à deux facteurs sur votre compte Microsoft, créez un mot de passe d'application sur :<br />
                  👉 <a href="https://account.live.com/proofs/manage/additional" target="_blank" rel="noreferrer" className="text-indigo-400 font-bold underline inline-flex items-center gap-1">
                    account.live.com/proofs/manage/additional <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>
            )}

            {/* Host & Port */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Hôte SMTP (Host)</label>
                <input
                  type="text"
                  required
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Port SMTP</label>
                <input
                  type="number"
                  required
                  value={port}
                  onChange={(e) => setPort(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Auth User & Password */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nom d'utilisateur / E-mail</label>
                <input
                  type="email"
                  required
                  value={authUser}
                  onChange={(e) => {
                    const previous = authUser;
                    setAuthUser(e.target.value);
                    if (!fromEmail || fromEmail === previous) setFromEmail(e.target.value);
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder="votre-adresse@outlook.de"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mot de passe SMTP
                </label>
                <input
                  type="password"
                  value={authPass}
                  onChange={(e) => setAuthPass(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder={hasSavedPassword ? 'Mot de passe enregistré (laisser vide pour conserver)' : "Mot de passe ou mot de passe d'application"}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Nom de l’expéditeur</label>
                <input
                  type="text"
                  required
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder="Votre nom complet"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Adresse d’expéditeur / Reply-To</label>
                <input
                  type="email"
                  required
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder={authUser || 'votre-adresse@email.de'}
                />
              </div>
            </div>

            {provider === 'custom' && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div>
                  <p className="text-xs font-bold text-white">Serveur de réception IMAP</p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Utilisé uniquement pour afficher les réponses des entreprises dans la messagerie.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Hôte IMAP</label>
                    <input
                      type="text"
                      required={imapActive}
                      value={imapHost}
                      onChange={(e) => setImapHost(e.target.value)}
                      placeholder="imap.votre-fournisseur.de"
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Port IMAP</label>
                    <input
                      type="number"
                      min={1}
                      max={65535}
                      required={imapActive}
                      value={imapPort}
                      onChange={(e) => setImapPort(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={imapSecure}
                    onChange={(e) => setImapSecure(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
                  />
                  Connexion IMAP sécurisée (TLS)
                </label>
              </div>
            )}

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={smtpActive}
                  onChange={(e) => setSmtpActive(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
                />
                Autoriser l’envoi des candidatures
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={imapActive}
                  onChange={(e) => setImapActive(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
                />
                Synchroniser les réponses dans la messagerie
              </label>
              {provider === 'custom' && (
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={secure}
                    onChange={(e) => setSecure(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
                  />
                  TLS implicite (généralement port 465)
                </label>
              )}
              <span className={`text-xs font-bold ${smtpTested ? 'text-emerald-400' : 'text-amber-400'}`}>
                {smtpTested ? '✓ Connexion enregistrée et testée' : 'Connexion non testée'}
              </span>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleTestSmtp}
                disabled={testingSmtp || (!authPass && !hasSavedPassword)}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center gap-2 transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${testingSmtp ? 'animate-spin' : ''}`} />
                <span>{testingSmtp ? 'Vérification...' : 'Tester la Connexion'}</span>
              </button>

              <button
                type="submit"
                disabled={savingSmtp}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{savingSmtp ? 'Enregistrement...' : 'Enregistrer le SMTP'}</span>
              </button>
            </div>
          </form>
        </div>

        {/* Right 1 Col: Multi-channel Notification Preferences */}
        <div className="space-y-6">
          <form onSubmit={handleSaveNotifications} className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl space-y-6 shadow-xl">
            <h3 className="text-base font-bold text-white border-b border-slate-800 pb-3 flex items-center gap-2">
              <Bell className="w-4 h-4 text-indigo-400" /> Notifications Multi-Canaux
            </h3>

            {notifMsg && (
              <div className={`p-3 text-xs rounded-xl flex items-center gap-2 ${
                notifMsg.error
                  ? 'bg-rose-950/80 border border-rose-800 text-rose-200'
                  : 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
              }`}>
                {notifMsg.error
                  ? <AlertCircle className="w-4 h-4 text-rose-400" />
                  : <Check className="w-4 h-4 text-emerald-400" />}
                <span>{notifMsg.text}</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <label className="flex items-center justify-between font-bold text-white cursor-pointer">
                  <span>Alertes par E-mail</span>
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
                  />
                </label>
                <p className="text-[11px] text-slate-400">Recevez les nouvelles offres d'Ausbildung correspondantes.</p>
              </div>

              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <label className="flex items-center justify-between font-bold text-white cursor-pointer">
                  <span>Bot Telegram</span>
                  <input
                    type="checkbox"
                    checked={telegramEnabled}
                    onChange={(e) => setTelegramEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
                  />
                </label>
                {telegramEnabled && (
                  <input
                    type="text"
                    placeholder="ID du Chat Telegram (ex: 12345678)"
                    value={telegramChatId}
                    onChange={(e) => setTelegramChatId(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                  />
                )}
              </div>

              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                <label className="flex items-center justify-between font-bold text-white cursor-pointer">
                  <span>Webhook Discord</span>
                  <input
                    type="checkbox"
                    checked={discordEnabled}
                    onChange={(e) => setDiscordEnabled(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
                  />
                </label>
                {discordEnabled && (
                  <input
                    type="text"
                    placeholder="URL du Webhook Discord"
                    value={discordWebhookUrl}
                    onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white"
                  />
                )}
              </div>
            </div>

            <button
              type="submit"
              disabled={savingNotif}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-lg transition-all"
            >
              {savingNotif ? 'Enregistrement...' : 'Sauvegarder les Alertes'}
            </button>
          </form>
        </div>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void saveAutoApply();
        }}
        className="bg-slate-900/90 border border-slate-800 p-6 rounded-2xl space-y-6 shadow-xl"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Power className={`w-4 h-4 ${autoApplyEnabled ? 'text-emerald-400' : 'text-slate-500'}`} />
              Auto-candidature Ausbildung
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Recherche automatiquement et envoie au maximum une candidature personnalisée toutes les 3 minutes pendant les jours et heures choisis.
              Les erreurs de limite Gmail/SMTP arrêtent le bot immédiatement, sans nouvelle tentative automatique.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={autoApplyEnabled}
            onClick={toggleAutoApply}
            disabled={savingAutoApply}
            className={`relative w-14 h-8 rounded-full transition-colors ${
              autoApplyEnabled ? 'bg-emerald-500' : 'bg-slate-700'
            } disabled:opacity-50`}
          >
            <span className={`absolute left-1 top-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${
              autoApplyEnabled ? 'translate-x-6' : 'translate-x-0'
            }`} />
          </button>
        </div>

        {autoApplyMsg && (
          <div className={`p-4 rounded-xl text-xs flex items-start gap-2 ${
            autoApplyMsg.error
              ? 'bg-rose-950/80 border border-rose-800 text-rose-200'
              : 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
          }`}>
            {autoApplyMsg.error
              ? <AlertCircle className="w-4 h-4 shrink-0" />
              : <Check className="w-4 h-4 shrink-0" />}
            <span>{autoApplyMsg.text}</span>
          </div>
        )}

        {smtpAutoSendHalt && (
          <div className="p-4 rounded-xl text-xs flex items-start gap-2 bg-rose-950/80 border border-rose-800 text-rose-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>
              <strong>Auto-candidature arrêtée par sécurité SMTP.</strong>{' '}
              {smtpAutoSendHalt} Vérifiez les limites de votre fournisseur avant de la réactiver manuellement.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              <BriefcaseBusiness className="w-3.5 h-3.5 inline mr-1" />
              Métiers / mots-clés
            </label>
            <input
              type="text"
              value={autoKeywords}
              onChange={(e) => setAutoKeywords(e.target.value)}
              placeholder="Fachinformatiker, Mechatroniker, Pflege"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">Séparez plusieurs valeurs par une virgule.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              <MapPin className="w-3.5 h-3.5 inline mr-1" />
              Villes
            </label>
            <input
              type="text"
              value={autoCities}
              onChange={(e) => setAutoCities(e.target.value)}
              placeholder="Berlin, Hamburg, München"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">Vide = toute l’Allemagne.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Länder</label>
            <input
              type="text"
              value={autoFederalStates}
              onChange={(e) => setAutoFederalStates(e.target.value)}
              placeholder="Berlin, Bayern, Nordrhein-Westfalen"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">Catégories</label>
            <input
              type="text"
              value={autoCategories}
              onChange={(e) => setAutoCategories(e.target.value)}
              placeholder="IT, Kaufmännisch, Handwerk, Pflege"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Rayon</label>
            <select
              value={autoRadiusKm}
              onChange={(e) => setAutoRadiusKm(Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
            >
              <option value={10}>10 km</option>
              <option value={25}>25 km</option>
              <option value={50}>50 km</option>
              <option value={100}>100 km</option>
              <option value={200}>200 km</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Score minimum IA</label>
            <input
              type="number"
              min={0}
              max={100}
              value={autoMinMatchScore}
              onChange={(e) => setAutoMinMatchScore(Number(e.target.value))}
              className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white"
            />
          </div>
        </div>

        <fieldset className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
          <legend className="px-2 text-xs font-bold text-white flex items-center gap-2">
            <Clock3 className="w-4 h-4 text-blue-400" />
            Planning d’envoi
          </legend>
          <div>
            <span className="block text-xs font-semibold text-slate-300 mb-2">Jours actifs</span>
            <div className="flex flex-wrap gap-2">
              {AUTO_APPLY_DAYS.map((day) => {
                const selected = autoScheduleDays.includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setAutoScheduleDays((current) =>
                      selected
                        ? current.filter((value) => value !== day.value)
                        : [...current, day.value]
                    )}
                    className={`min-w-12 px-3 py-2 rounded-lg border text-xs font-bold transition-colors ${
                      selected
                        ? 'bg-blue-600 border-blue-500 text-white'
                        : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white'
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="auto-schedule-start" className="block text-xs font-semibold text-slate-300 mb-1">
                De
              </label>
              <input
                id="auto-schedule-start"
                type="time"
                value={autoScheduleStart}
                onChange={(event) => setAutoScheduleStart(event.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="auto-schedule-end" className="block text-xs font-semibold text-slate-300 mb-1">
                À
              </label>
              <input
                id="auto-schedule-end"
                type="time"
                value={autoScheduleEnd}
                onChange={(event) => setAutoScheduleEnd(event.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="auto-schedule-timezone" className="block text-xs font-semibold text-slate-300 mb-1">
                Fuseau horaire
              </label>
              <select
                id="auto-schedule-timezone"
                value={autoScheduleTimezone}
                onChange={(event) => setAutoScheduleTimezone(event.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white"
              >
                {!['Europe/Berlin', 'Africa/Casablanca', 'Europe/Paris', 'UTC'].includes(autoScheduleTimezone) && (
                  <option value={autoScheduleTimezone}>{autoScheduleTimezone}</option>
                )}
                <option value="Europe/Berlin">Allemagne (Berlin)</option>
                <option value="Africa/Casablanca">Maroc (Casablanca)</option>
                <option value="Europe/Paris">France (Paris)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Exemple : Lun–Ven, 08:00–15:00. « Exécuter maintenant » ignore ce planning.
          </p>
        </fieldset>

        <label className="flex items-center gap-2 text-xs font-semibold text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={autoRemoteOnly}
            onChange={(e) => setAutoRemoteOnly(e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 bg-slate-900 border-slate-700"
          />
          Uniquement les offres avec possibilité de télétravail
        </label>

        <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <Clock3 className="w-4 h-4 text-blue-400" />
            Rythme fixe : <strong className="text-white">1 candidature / 3 minutes</strong>
          </div>
          <div className="text-slate-400">
            Dernière exécution : <span className="text-slate-200">{autoLastRunAt ? new Date(autoLastRunAt).toLocaleString('fr-FR') : 'Jamais'}</span>
          </div>
          <div className="text-slate-400">
            Prochaine : <span className="text-slate-200">{autoApplyEnabled && autoNextRunAt ? new Date(autoNextRunAt).toLocaleString('fr-FR') : 'Désactivée'}</span>
          </div>
        </div>

        {autoLastResult && (
          <p className="text-[11px] text-slate-500 truncate" title={autoLastResult}>
            Dernier résultat : {autoApplyResultSummary(autoLastResult)}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={runAutoApplyNow}
            disabled={runningAutoApply || savingAutoApply}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-700 flex items-center gap-2 disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" />
            {runningAutoApply ? 'Exécution...' : 'Exécuter maintenant'}
          </button>
          <button
            type="submit"
            disabled={savingAutoApply || runningAutoApply}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl disabled:opacity-50"
          >
            {savingAutoApply ? 'Enregistrement...' : 'Enregistrer filtres et planning'}
          </button>
        </div>
      </form>
    </div>
  );
}
