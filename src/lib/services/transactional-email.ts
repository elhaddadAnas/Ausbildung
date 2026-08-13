import { sendEmailNotification, type SMTPConfigInput } from '@/lib/services/smtp';
import type { PaidSubscriptionPlan } from '@/lib/bank-transfer';
import { SUBSCRIPTION_PLANS } from '@/lib/subscriptions';

type DeliveryResult = { success: boolean; error?: string };

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000').replace(/\/+$/, '');
}

function config(): SMTPConfigInput | null {
  const host = process.env.SYSTEM_SMTP_HOST?.trim() || '';
  const authUser = process.env.SYSTEM_SMTP_USER?.trim() || '';
  const authPass = process.env.SYSTEM_SMTP_PASSWORD || '';
  const fromEmail = process.env.SYSTEM_SMTP_FROM_EMAIL?.trim() || authUser;
  if (!host || !authUser || !authPass || !fromEmail) return null;
  return {
    provider: 'custom',
    host,
    port: Number(process.env.SYSTEM_SMTP_PORT || 587),
    secure: process.env.SYSTEM_SMTP_SECURE === 'true',
    authUser,
    authPass,
    fromEmail,
    fromName: process.env.SYSTEM_SMTP_FROM_NAME?.trim() || 'Azubora',
  };
}

export function systemSmtpConfigured(): boolean {
  return Boolean(config());
}

function layout(title: string, content: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a">
  <div style="max-width:620px;margin:0 auto;padding:32px 16px">
    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:28px">
      <div style="font-size:12px;font-weight:700;color:#2563eb;text-transform:uppercase">Azubora</div>
      <h1 style="font-size:24px;margin:10px 0 20px">${escapeHtml(title)}</h1>
      ${content}
    </div>
    <p style="font-size:11px;color:#64748b;text-align:center">Message transactionnel lié à votre compte.</p>
  </div></body></html>`;
}

async function send(
  to: string,
  subject: string,
  html: string,
  text: string
): Promise<DeliveryResult> {
  const smtp = config();
  if (!smtp) return { success: false, error: 'Le SMTP système n’est pas configuré.' };
  const result = await sendEmailNotification(smtp, to, subject, html, [], text);
  if (!result.success) {
    console.warn(`Transactional email failed (${subject}):`, result.error);
  }
  return { success: result.success, error: result.error };
}

export function sendWelcomeEmail(to: string, name: string) {
  return send(
    to,
    'Bienvenue sur Azubora',
    layout('Bienvenue', `<p>Bonjour ${escapeHtml(name)},</p><p>Votre compte est prêt. Complétez votre profil pour commencer à rechercher et gérer vos candidatures.</p><p><a href="${appUrl()}/dashboard">Ouvrir mon tableau de bord</a></p>`),
    `Bonjour ${name}, votre compte Azubora est prêt. ${appUrl()}/dashboard`
  );
}

type TransferMail = {
  to: string;
  name: string;
  productLabel: string;
  amountEur: number;
  reference: string;
  accountHolder: string;
  bankName: string;
  rib: string;
  iban: string;
  bic: string;
  instructions?: string;
};

export function sendBankTransferInstructionsEmail(input: TransferMail) {
  const rows = [
    ['Montant', `${input.amountEur.toFixed(2)} EUR`],
    ['Bénéficiaire', input.accountHolder],
    ['Banque', input.bankName || '—'],
    ...(input.rib ? [['RIB', input.rib]] : []),
    ...(input.iban ? [['IBAN', input.iban]] : []),
    ...(input.bic ? [['BIC', input.bic]] : []),
    ['Référence obligatoire', input.reference],
  ].map(([label, value]) => `<tr><td style="padding:7px;font-weight:700">${escapeHtml(label)}</td><td style="padding:7px">${escapeHtml(value)}</td></tr>`).join('');
  return send(
    input.to,
    `Instructions de virement — ${input.productLabel}`,
    layout('Effectuer votre virement', `<p>Bonjour ${escapeHtml(input.name)},</p><p>Votre achat : <strong>${escapeHtml(input.productLabel)}</strong>. Utilisez les coordonnées ci-dessous. Il sera activé au plus tard dans les 24 heures suivant la réception et la validation du virement.</p><table style="width:100%;background:#f8fafc;border-radius:12px">${rows}</table>${input.instructions ? `<p>${escapeHtml(input.instructions)}</p>` : ''}<p><a href="${appUrl()}/subscription">Suivre mon paiement</a></p>`),
    `${input.productLabel}. Montant: ${input.amountEur.toFixed(2)} EUR. Bénéficiaire: ${input.accountHolder}. Banque: ${input.bankName}. RIB: ${input.rib}. IBAN: ${input.iban}. BIC: ${input.bic}. Référence obligatoire: ${input.reference}. Activation au plus tard dans les 24 heures suivant la réception du virement.`
  );
}

export function sendTransferSubmittedEmail(to: string, name: string, reference: string) {
  return send(
    to,
    `Virement déclaré — ${reference}`,
    layout('Déclaration reçue', `<p>Bonjour ${escapeHtml(name)},</p><p>Nous avons reçu votre déclaration de virement <strong>${escapeHtml(reference)}</strong>. Un administrateur vérifiera sa réception avant de valider votre achat.</p>`),
    `Bonjour ${name}, votre déclaration de virement ${reference} a été reçue et sera vérifiée.`
  );
}

export function sendAdminTransferAlert(input: {
  userName: string; userEmail: string; productLabel: string;
  amountEur: number; reference: string; submitted: boolean;
}) {
  const to = process.env.BILLING_ADMIN_EMAIL?.trim() || process.env.ADMIN_EMAIL?.trim() || '';
  if (!to) return Promise.resolve({ success: false, error: 'BILLING_ADMIN_EMAIL absent.' });
  const action = input.submitted ? 'Virement déclaré par le client' : 'Nouvelle demande de virement';
  return send(
    to,
    `${action} — ${input.reference}`,
    layout(action, `<p>Client : ${escapeHtml(input.userName)} (${escapeHtml(input.userEmail)})</p><p>Achat : ${escapeHtml(input.productLabel)} · ${input.amountEur.toFixed(2)} EUR</p><p>Référence : <strong>${escapeHtml(input.reference)}</strong></p><p><a href="${appUrl()}/admin">Vérifier dans l’administration</a></p>`),
    `${action}. ${input.userName} (${input.userEmail}), ${input.productLabel}, ${input.amountEur.toFixed(2)} EUR, référence ${input.reference}. ${appUrl()}/admin`
  );
}

export function sendSubscriptionApprovedEmail(to: string, name: string, plan: PaidSubscriptionPlan, end: Date) {
  return send(
    to,
    `Formule ${SUBSCRIPTION_PLANS[plan].name} activée`,
    layout('Paiement validé', `<p>Bonjour ${escapeHtml(name)},</p><p>Votre paiement a été validé et votre formule <strong>${escapeHtml(SUBSCRIPTION_PLANS[plan].name)}</strong> est active jusqu’au ${end.toLocaleDateString('fr-FR')}.</p><p><a href="${appUrl()}/dashboard">Accéder au service</a></p>`),
    `Bonjour ${name}, votre formule ${SUBSCRIPTION_PLANS[plan].name} est active jusqu’au ${end.toLocaleDateString('fr-FR')}.`
  );
}

export function sendCreditTopupApprovedEmail(to: string, name: string, credits: number) {
  return send(
    to,
    `${credits.toLocaleString('fr-FR')} crédits IA ajoutés`,
    layout('Crédits ajoutés', `<p>Bonjour ${escapeHtml(name)},</p><p>Votre paiement a été validé. <strong>${credits.toLocaleString('fr-FR')} crédits IA</strong> ont été ajoutés à votre solde et restent disponibles jusqu’à leur utilisation.</p><p><a href="${appUrl()}/dashboard">Accéder au service</a></p>`),
    `Bonjour ${name}, votre paiement a été validé et ${credits.toLocaleString('fr-FR')} crédits IA ont été ajoutés à votre solde.`
  );
}

export function sendSubscriptionRejectedEmail(to: string, name: string, reference: string, note?: string | null) {
  return send(
    to,
    `Virement non validé — ${reference}`,
    layout('Paiement non validé', `<p>Bonjour ${escapeHtml(name)},</p><p>Le virement portant la référence <strong>${escapeHtml(reference)}</strong> n’a pas pu être validé.</p>${note ? `<p>Motif : ${escapeHtml(note)}</p>` : ''}<p>Vous pouvez créer une nouvelle demande depuis votre abonnement.</p>`),
    `Bonjour ${name}, le virement ${reference} n’a pas pu être validé.${note ? ` Motif: ${note}` : ''}`
  );
}

export function sendSubscriptionExpiringEmail(to: string, name: string, plan: string, end: Date) {
  return send(
    to,
    `Votre formule ${plan} expire bientôt`,
    layout('Expiration prochaine', `<p>Bonjour ${escapeHtml(name)},</p><p>Votre formule ${escapeHtml(plan)} expire le ${end.toLocaleDateString('fr-FR')}. Effectuez un nouveau virement depuis votre espace pour la renouveler.</p><p><a href="${appUrl()}/subscription">Renouveler</a></p>`),
    `Bonjour ${name}, votre formule ${plan} expire le ${end.toLocaleDateString('fr-FR')}. ${appUrl()}/subscription`
  );
}

export function sendSubscriptionExpiredEmail(to: string, name: string) {
  return send(
    to,
    'Votre formule payante a expiré',
    layout('Formule expirée', `<p>Bonjour ${escapeHtml(name)},</p><p>Votre formule payante a expiré. Votre compte reste accessible avec la formule Découverte.</p><p><a href="${appUrl()}/subscription">Voir les formules</a></p>`),
    `Bonjour ${name}, votre formule payante a expiré. Votre compte reste accessible avec la formule Découverte.`
  );
}
