import PDFDocument from 'pdfkit';

export interface MotivationLetterDocumentInput {
  applicant: {
    name: string;
    email: string;
    phone?: string;
    address?: string;
    city?: string;
  };
  company: {
    name: string;
    location?: string;
  };
  jobTitle: string;
  motivationLetter: string;
}

function safePdfText(value: string | undefined): string {
  return String(value || '')
    .replace(/\r/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
}

export function safeApplicantFileName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Bewerber';
}

export async function createMotivationLetterPdf(
  input: MotivationLetterDocumentInput
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 52, right: 58, bottom: 54, left: 58 },
    info: {
      Title: `Motivationsschreiben – ${safePdfText(input.jobTitle)}`,
      Author: safePdfText(input.applicant.name),
      Subject: `Bewerbung bei ${safePdfText(input.company.name)}`,
      Creator: 'Azubora Bewerbungsassistent',
    },
  });

  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const applicantContact = [
    safePdfText(input.applicant.email),
    safePdfText(input.applicant.phone),
    safePdfText([input.applicant.address, input.applicant.city].filter(Boolean).join(', ')),
  ].filter(Boolean);

  doc
    .save()
    .rect(0, 0, 12, doc.page.height)
    .fill('#2563eb')
    .restore();

  doc
    .font('Helvetica-Bold')
    .fontSize(19)
    .fillColor('#0f172a')
    .text(safePdfText(input.applicant.name), { width: pageWidth });

  if (applicantContact.length) {
    doc
      .moveDown(0.25)
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor('#475569')
      .text(applicantContact.join('  ·  '), { width: pageWidth });
  }

  doc
    .moveDown(1.5)
    .font('Helvetica')
    .fontSize(10)
    .fillColor('#334155')
    .text(safePdfText(input.company.name));
  if (input.company.location) doc.text(safePdfText(input.company.location));

  doc
    .moveDown(1.2)
    .fontSize(9.5)
    .fillColor('#64748b')
    .text(
      new Intl.DateTimeFormat('de-DE', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      }).format(new Date()),
      { align: 'right' }
    );

  doc
    .moveDown(1.2)
    .font('Helvetica-Bold')
    .fontSize(13)
    .fillColor('#0f172a')
    .text(`Bewerbung um die Ausbildungsstelle „${safePdfText(input.jobTitle)}“`, {
      width: pageWidth,
    });

  doc
    .moveDown(1)
    .font('Helvetica')
    .fontSize(10.5)
    .fillColor('#1e293b')
    .text(safePdfText(input.motivationLetter), {
      width: pageWidth,
      align: 'left',
      lineGap: 3.2,
    });

  const footerY = doc.page.height - 35;
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#94a3b8')
    .text('Persönliche Bewerbungsunterlagen', doc.page.margins.left, footerY, {
      width: pageWidth,
      align: 'right',
      lineBreak: false,
    });

  doc.end();
  return completed;
}
