"""Application documents: Motivationsschreiben PDF and CV text extraction."""
import datetime as dt
import io
import re
import unicodedata
from xml.sax.saxutils import escape

from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

GERMAN_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September',
                 'Oktober', 'November', 'Dezember']
_CONTROL_CHARACTERS = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f]')


def safe_pdf_text(value: str | None) -> str:
    return _CONTROL_CHARACTERS.sub('', str(value or '').replace('\r', '')).strip()


def safe_applicant_file_name(value: str) -> str:
    ascii_name = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode('ascii')
    return re.sub(r'[^a-zA-Z0-9]+', '_', ascii_name).strip('_') or 'Bewerber'


def german_date(date: dt.date) -> str:
    return f'{date.day:02d}. {GERMAN_MONTHS[date.month - 1]} {date.year}'


def _markup(value: str) -> str:
    return escape(value).replace('\n', '<br/>')


def create_motivation_letter_pdf(*, applicant: dict, company: dict, job_title: str, motivation_letter: str,
                                 today: dt.date | None = None) -> bytes:
    buffer = io.BytesIO()
    margins = {'top': 52, 'right': 58, 'bottom': 54, 'left': 58}
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=margins['top'],
        rightMargin=margins['right'],
        bottomMargin=margins['bottom'],
        leftMargin=margins['left'],
        title=f'Motivationsschreiben – {safe_pdf_text(job_title)}',
        author=safe_pdf_text(applicant.get('name')),
        subject=f'Bewerbung bei {safe_pdf_text(company.get("name"))}',
        creator='Azubora Bewerbungsassistent',
    )

    def style(name, font='Helvetica', size=10.0, color='#1e293b', leading=None, align=TA_LEFT, after=0.0):
        return ParagraphStyle(name, fontName=font, fontSize=size, textColor=HexColor(color),
                              leading=leading or size * 1.2, alignment=align, spaceAfter=after)

    name_style = style('name', 'Helvetica-Bold', 19, '#0f172a')
    contact_style = style('contact', size=9.5, color='#475569')
    company_style = style('company', size=10, color='#334155')
    date_style = style('date', size=9.5, color='#64748b', align=TA_RIGHT)
    title_style = style('title', 'Helvetica-Bold', 13, '#0f172a', leading=16)
    body_style = style('body', size=10.5, color='#1e293b', leading=10.5 * 1.2 + 3.2, after=10.5)

    contact = [
        safe_pdf_text(applicant.get('email')),
        safe_pdf_text(applicant.get('phone')),
        safe_pdf_text(', '.join(part for part in (applicant.get('address'), applicant.get('city')) if part)),
    ]
    story = [Paragraph(_markup(safe_pdf_text(applicant.get('name'))), name_style)]
    contact_line = '  ·  '.join(part for part in contact if part)
    if contact_line:
        story += [Spacer(0, 4), Paragraph(_markup(contact_line), contact_style)]
    story += [Spacer(0, 22), Paragraph(_markup(safe_pdf_text(company.get('name'))), company_style)]
    if company.get('location'):
        story.append(Paragraph(_markup(safe_pdf_text(company['location'])), company_style))
    story += [
        Spacer(0, 14),
        Paragraph(german_date(today or dt.date.today()), date_style),
        Spacer(0, 16),
        Paragraph(_markup(f'Bewerbung um die Ausbildungsstelle „{safe_pdf_text(job_title)}“'), title_style),
        Spacer(0, 14),
    ]
    for paragraph in re.split(r'\n{2,}', safe_pdf_text(motivation_letter)):
        if paragraph.strip():
            story.append(Paragraph(_markup(paragraph.strip()), body_style))

    def decorate(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(HexColor('#2563eb'))
        canvas.rect(0, 0, 12, A4[1], stroke=0, fill=1)
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(HexColor('#94a3b8'))
        canvas.drawRightString(A4[0] - margins['right'], 28, 'Persönliche Bewerbungsunterlagen')
        canvas.restoreState()

    document.build(story, onFirstPage=decorate, onLaterPages=decorate)
    return buffer.getvalue()


def extract_pdf_text(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    return '\n'.join(page.extract_text() or '' for page in reader.pages)


def extract_docx_text(data: bytes) -> str:
    import mammoth

    return mammoth.extract_raw_text(io.BytesIO(data)).value or ''
