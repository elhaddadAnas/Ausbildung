'use client';

import React, { useEffect, useState } from 'react';
import {
  Building2,
  Check,
  Clock3,
  Copy,
  CreditCard,
  Crown,
  Loader2,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';

type PlanCode = 'BASIC' | 'PLUS' | 'PRO';
type Plan = {
  code: PlanCode;
  name: string;
  monthlyPriceEur: number;
  applicationsPerMonth: number;
  aiCreditsPerMonth: number;
  autoApply: boolean;
  recommended: boolean;
  features: string[];
};
type SubscriptionData = {
  planCode: PlanCode;
  effectivePlanCode: PlanCode;
  status: string;
  requestedPlan: PlanCode | null;
  unlimited: boolean;
  hasPaidSubscription: boolean;
  periodEnd: string;
  usage: { aiCredits: number; applications: number };
  remaining: { aiCredits: number | null; applications: number | null };
};
type Payment = {
  id: string;
  plan: 'PLUS' | 'PRO';
  amountEur: number;
  reference: string;
  status: 'PENDING' | 'SUBMITTED';
  expiresAt: string;
};
type BankDetails = {
  accountHolder: string;
  bankName: string;
  rib: string;
  iban: string;
  bic: string;
  instructions: string;
};

export default function SubscriptionPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [bankDetails, setBankDetails] = useState<BankDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [copied, setCopied] = useState('');
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadData = async () => {
    const [subscriptionResponse, paymentResponse] = await Promise.all([
      fetch('/api/subscription', { cache: 'no-store' }),
      fetch('/api/subscription/payment', { cache: 'no-store' }),
    ]);
    const subscriptionJson = await subscriptionResponse.json().catch(() => ({}));
    const paymentJson = await paymentResponse.json().catch(() => ({}));
    if (!subscriptionResponse.ok) {
      throw new Error(subscriptionJson.error || 'Impossible de charger les abonnements.');
    }
    if (!paymentResponse.ok) {
      throw new Error(paymentJson.error || 'Impossible de charger le paiement.');
    }
    setPlans(subscriptionJson.plans || []);
    setSubscription(subscriptionJson.subscription);
    setPayment(paymentJson.payment || null);
    setBankDetails(paymentJson.bankDetails || null);
  };

  useEffect(() => {
    loadData()
      .catch((loadError) => setError(
        loadError instanceof Error ? loadError.message : 'Impossible de charger les abonnements.'
      ))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!paymentDialogOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPaymentDialogOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
      document.body.style.overflow = '';
    };
  }, [paymentDialogOpen]);

  const requestPlan = async (plan: PlanCode) => {
    if (plan === 'BASIC') return;
    setRequesting(plan);
    setMessage('');
    setError('');
    try {
      const response = await fetch('/api/subscription/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'La demande n’a pas pu être créée.');
      setPayment(data.payment);
      setBankDetails(data.bankDetails);
      setMessage(
        !data.bankDetails
          ? 'Formule sélectionnée. Les coordonnées bancaires apparaîtront dès leur configuration par l’administrateur.'
          : data.emailWarning
            ? 'Demande créée. Les instructions sont affichées ci-dessous; leur envoi par e-mail a échoué.'
            : 'Demande créée. Les instructions ont aussi été envoyées par e-mail.'
      );
      await loadData();
      setPaymentDialogOpen(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'La demande a échoué.');
    } finally {
      setRequesting(null);
    }
  };

  const markSubmitted = async () => {
    if (!payment) return;
    setRequesting(payment.id);
    setError('');
    try {
      const response = await fetch('/api/subscription/payment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId: payment.id, action: 'submitted' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'La déclaration a échoué.');
      setPayment(data.payment);
      setMessage('Virement déclaré. Votre formule sera activée après vérification par un administrateur.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'La déclaration a échoué.');
    } finally {
      setRequesting(null);
    }
  };

  const copyValue = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(''), 1500);
  };

  if (loading) {
    return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-10 w-10 animate-spin text-blue-500" /></div>;
  }

  const activePlan = plans.find((plan) => plan.code === subscription?.effectivePlanCode);
  const applicationPercent = activePlan && !subscription?.unlimited
    ? Math.min(100, Number(subscription?.usage.applications) / activePlan.applicationsPerMonth * 100) : 0;
  const creditPercent = activePlan && !subscription?.unlimited
    ? Math.min(100, Number(subscription?.usage.aiCredits) / activePlan.aiCreditsPerMonth * 100) : 0;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 md:p-8">
      <header className="space-y-3 text-center">
        <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-blue-500">
          <Sparkles className="h-4 w-4" /> Abonnements
        </div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white md:text-4xl">Choisissez votre rythme de candidature</h1>
        <p className="mx-auto max-w-2xl text-sm text-slate-600 dark:text-slate-400">
          Sélectionnez une formule, effectuez le virement avec la référence indiquée, puis déclarez-le pour validation.
        </p>
      </header>

      {message && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center text-sm font-semibold text-emerald-600">{message}</div>}
      {error && <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-center text-sm font-semibold text-rose-600">{error}</div>}

      {paymentDialogOpen && payment && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPaymentDialogOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="bank-transfer-dialog-title"
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-blue-500/30 bg-white p-6 shadow-2xl dark:bg-slate-900 md:p-8"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-blue-600">
                  <Building2 className="h-4 w-4" /> Activation par virement bancaire
                </p>
                <h2 id="bank-transfer-dialog-title" className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
                  Formule {payment.plan === 'PLUS' ? 'Plus' : 'Pro'} — {payment.amountEur.toFixed(2)} EUR
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setPaymentDialogOpen(false)}
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="my-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="font-bold text-slate-900 dark:text-white">
                Vous devez effectuer un virement bancaire vers le RIB ci-dessous pour activer votre abonnement.
              </p>
              <p className="mt-2 flex gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                L’abonnement sera activé au plus tard dans les 24 heures suivant la réception du virement bancaire.
              </p>
            </div>

            {bankDetails ? (
              <div className="grid gap-3 md:grid-cols-2">
                <BankRow label="Montant" value={`${payment.amountEur.toFixed(2)} EUR`} copied={copied} onCopy={copyValue} />
                <BankRow label="Bénéficiaire" value={bankDetails.accountHolder} copied={copied} onCopy={copyValue} />
                <BankRow label="Banque" value={bankDetails.bankName || '—'} copied={copied} onCopy={copyValue} />
                {bankDetails.rib && <BankRow label="RIB" value={bankDetails.rib} copied={copied} onCopy={copyValue} />}
                {bankDetails.iban && <BankRow label="IBAN" value={bankDetails.iban} copied={copied} onCopy={copyValue} />}
                {bankDetails.bic && <BankRow label="BIC" value={bankDetails.bic} copied={copied} onCopy={copyValue} />}
                <div className="md:col-span-2">
                  <BankRow label="Référence obligatoire à indiquer" value={payment.reference} copied={copied} onCopy={copyValue} important />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-semibold text-rose-600 dark:text-rose-300">
                Votre formule a bien été sélectionnée, mais les coordonnées bancaires ne sont pas encore configurées. Elles apparaîtront ici dès que l’administrateur aura ajouté le RIB.
              </div>
            )}

            {bankDetails?.instructions && (
              <p className="mt-4 text-xs text-slate-600 dark:text-slate-300">{bankDetails.instructions}</p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Cette demande de paiement est valable jusqu’au {new Date(payment.expiresAt).toLocaleString('fr-FR')}.
            </p>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPaymentDialogOpen(false)}
                className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={markSubmitted}
                disabled={!bankDetails || payment.status === 'SUBMITTED' || requesting !== null}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {requesting === payment.id && <Loader2 className="h-4 w-4 animate-spin" />}
                {payment.status === 'SUBMITTED' ? 'Virement déjà déclaré' : 'J’ai effectué le virement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {subscription && activePlan && (
        <section className="grid gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/70 md:grid-cols-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Formule active</p>
            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
              {subscription.unlimited ? 'Administrateur — Illimité' : activePlan.name}
            </p>
            {!subscription.unlimited && (
              <p className="text-xs text-slate-500">
                {subscription.hasPaidSubscription ? 'Valable jusqu’au' : 'Quotas renouvelés le'}{' '}
                {new Date(subscription.periodEnd).toLocaleDateString('fr-FR')}
              </p>
            )}
          </div>
          <UsageBar label="Candidatures" value={subscription.usage.applications} limit={activePlan.applicationsPerMonth} percent={applicationPercent} unlimited={subscription.unlimited} />
          <UsageBar label="Crédits IA" value={subscription.usage.aiCredits} limit={activePlan.aiCreditsPerMonth} percent={creditPercent} unlimited={subscription.unlimited} />
        </section>
      )}

      {payment && bankDetails && (
        <section className="rounded-3xl border border-blue-500/30 bg-blue-500/5 p-6 md:p-8">
          <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-blue-600"><Building2 className="h-4 w-4" /> Virement bancaire</p>
              <h2 className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
                {payment.amountEur.toFixed(2)} EUR — formule {payment.plan === 'PLUS' ? 'Plus' : 'Pro'}
              </h2>
            </div>
            <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${payment.status === 'SUBMITTED' ? 'bg-amber-500/15 text-amber-600' : 'bg-blue-500/15 text-blue-600'}`}>
              {payment.status === 'SUBMITTED' ? 'En attente de validation' : 'Virement à effectuer'}
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <BankRow label="Bénéficiaire" value={bankDetails.accountHolder} copied={copied} onCopy={copyValue} />
            <BankRow label="Banque" value={bankDetails.bankName || '—'} copied={copied} onCopy={copyValue} />
            {bankDetails.rib && <BankRow label="RIB" value={bankDetails.rib} copied={copied} onCopy={copyValue} />}
            {bankDetails.iban && <BankRow label="IBAN" value={bankDetails.iban} copied={copied} onCopy={copyValue} />}
            {bankDetails.bic && <BankRow label="BIC" value={bankDetails.bic} copied={copied} onCopy={copyValue} />}
            <div className="md:col-span-2"><BankRow label="Référence obligatoire" value={payment.reference} copied={copied} onCopy={copyValue} important /></div>
          </div>
          {bankDetails.instructions && <p className="mt-4 text-xs text-slate-600 dark:text-slate-300">{bankDetails.instructions}</p>}
          <p className="mt-3 text-xs text-slate-500">Demande valable jusqu’au {new Date(payment.expiresAt).toLocaleString('fr-FR')}.</p>
          <button
            onClick={markSubmitted}
            disabled={payment.status === 'SUBMITTED' || requesting !== null}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {requesting === payment.id && <Loader2 className="h-4 w-4 animate-spin" />}
            {payment.status === 'SUBMITTED' ? 'Virement déjà déclaré' : 'J’ai effectué le virement'}
          </button>
        </section>
      )}

      <section className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => {
          const isActive = subscription?.planCode === plan.code && subscription.status === 'ACTIVE';
          const isPending = payment?.plan === plan.code;
          const unavailable = subscription?.unlimited || isActive || plan.code === 'BASIC';
          return (
            <article key={plan.code} className={`relative flex flex-col rounded-3xl border p-6 shadow-xl ${plan.recommended ? 'border-blue-500 bg-gradient-to-b from-blue-500/10 to-white dark:to-slate-950' : 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/70'}`}>
              {plan.recommended && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-4 py-1 text-[10px] font-black uppercase tracking-wider text-white">Recommandé</span>}
              <div className="mb-5 flex items-center justify-between">
                <div className="rounded-2xl bg-slate-100 p-3 text-blue-600 dark:bg-slate-800 dark:text-blue-400">
                  {plan.code === 'PRO' ? <Crown /> : plan.code === 'PLUS' ? <Zap /> : <CreditCard />}
                </div>
                {isActive && <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold uppercase text-emerald-500">Active</span>}
              </div>
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">{plan.name}</h2>
              <p className="mt-2 text-4xl font-black text-slate-900 dark:text-white">
                {plan.monthlyPriceEur === 0 ? 'Gratuit' : `${plan.monthlyPriceEur.toFixed(2)} €`}
                {plan.monthlyPriceEur > 0 && <span className="text-sm font-medium text-slate-500"> / mois</span>}
              </p>
              <ul className="my-7 flex-1 space-y-3">
                {plan.features.map((feature) => <li key={feature} className="flex gap-2 text-sm text-slate-600 dark:text-slate-300"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{feature}</li>)}
              </ul>
              <button
                onClick={() => requestPlan(plan.code)}
                disabled={Boolean(unavailable || requesting)}
                className={`flex items-center justify-center rounded-xl px-4 py-3 text-sm font-bold transition ${unavailable ? 'cursor-not-allowed bg-slate-200 text-slate-500 dark:bg-slate-800' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
              >
                {requesting === plan.code && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {subscription?.unlimited ? 'Accès admin illimité' : isActive ? 'Formule actuelle' : plan.code === 'BASIC' ? 'Formule gratuite' : isPending ? 'Afficher les coordonnées' : 'Choisir et payer par virement'}
              </button>
            </article>
          );
        })}
      </section>
      <p className="text-center text-xs text-slate-500">La formule payante est activée uniquement après réception et validation du virement.</p>
    </div>
  );
}

function BankRow({ label, value, copied, onCopy, important = false }: {
  label: string; value: string; copied: string;
  onCopy: (label: string, value: string) => void; important?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${important ? 'border-amber-500/40 bg-amber-500/10' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'}`}>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
        <p className="break-all font-mono text-sm font-bold text-slate-900 dark:text-white">{value}</p>
      </div>
      {value !== '—' && <button onClick={() => onCopy(label, value)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-500/10" title={`Copier ${label}`}><Copy className="h-4 w-4" />{copied === label && <span className="sr-only">Copié</span>}</button>}
    </div>
  );
}

function UsageBar({ label, value, limit, percent, unlimited = false }: {
  label: string; value: number; limit: number; percent: number; unlimited?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-300"><span>{label}</span><span>{unlimited ? 'Illimité' : `${value} / ${limit}`}</span></div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className={`h-full rounded-full ${unlimited ? 'w-full bg-gradient-to-r from-emerald-500 to-blue-500' : 'bg-gradient-to-r from-blue-600 to-indigo-500'}`} style={unlimited ? undefined : { width: `${percent}%` }} />
      </div>
    </div>
  );
}
