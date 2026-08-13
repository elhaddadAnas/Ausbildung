export interface SMTPErrorClassification {
  haltAutoSending: boolean;
  responseCode: number | null;
  enhancedCode: string | null;
  reason: string | null;
}

function errorPart(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return '';
}

export function classifySMTPError(error: unknown): SMTPErrorClassification {
  const details = error && typeof error === 'object'
    ? error as Record<string, unknown>
    : {};
  const raw = [
    error instanceof Error ? error.message : errorPart(error),
    errorPart(details.message),
    errorPart(details.response),
    errorPart(details.code),
    errorPart(details.command),
  ].filter(Boolean).join(' ');

  const explicitResponseCode = Number(details.responseCode);
  const codeMatch = raw.match(/\b(421|450)\b/);
  const responseCode = Number.isFinite(explicitResponseCode) && explicitResponseCode >= 100
    ? explicitResponseCode
    : codeMatch
      ? Number(codeMatch[1])
      : null;
  const enhancedCode = raw.match(/\b([245]\.\d{1,3}\.\d{1,3})\b/)?.[1] || null;
  const limitWarning =
    /daily (?:user |smtp relay )?sending limit exceeded|you have reached (?:a |the )?limit for sending mail|sending (?:quota|limit) (?:has been )?(?:exceeded|reached)|quota exceeded|unusual rate of (?:unsolicited )?email|(?:temporarily )?rate[- ]limit(?:ed|ing)?|too many (?:messages|emails)|temporarily deferred due to .*rate/i.test(raw);

  if (responseCode === 421 || responseCode === 450) {
    return {
      haltAutoSending: true,
      responseCode,
      enhancedCode,
      reason: `SMTP ${responseCode} temporaire détecté`,
    };
  }
  if (enhancedCode === '4.7.28') {
    return {
      haltAutoSending: true,
      responseCode,
      enhancedCode,
      reason: 'Limite de débit Gmail 4.7.28 détectée',
    };
  }
  if (limitWarning) {
    return {
      haltAutoSending: true,
      responseCode,
      enhancedCode,
      reason: 'Limite quotidienne ou limitation de débit SMTP détectée',
    };
  }
  return {
    haltAutoSending: false,
    responseCode,
    enhancedCode,
    reason: null,
  };
}

export function formatSMTPHaltMessage(classification: SMTPErrorClassification): string {
  const codes = [
    classification.responseCode ? String(classification.responseCode) : '',
    classification.enhancedCode || '',
  ].filter(Boolean).join(' / ');
  const suffix = codes ? ` (${codes})` : '';
  return `${classification.reason || 'Limite SMTP détectée'}${suffix}. L’auto-candidature a été arrêtée et ne reprendra qu’après une réactivation manuelle.`;
}
