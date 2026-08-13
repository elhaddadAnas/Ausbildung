export interface SearchFilters {
  was?: string; // Job title or keyword e.g. "Fachinformatiker"
  wo?: string;  // City or postal code e.g. "Berlin" or "10117"
  umkreis?: number; // Distance in km: 10, 20, 50, 100
  bundesland?: string; // e.g. "Bayern", "NRW", "Berlin"
  contractType?: string; // "Vollzeit", "Teilzeit", "Egal"
  remote?: boolean;
  category?: string; // "IT", "Kaufmännisch", "Handwerk", etc.
  page?: number;
  limit?: number;
}

export interface BAJobItem {
  id: string;
  externalId: string;
  title: string;
  beruf?: string;
  company: string;
  contactEmail: string | null;
  contactEmailVerified?: boolean;
  location: string;
  postalCode: string;
  federalState: string;
  category: string;
  contractType: string;
  workTime: string;
  remote: boolean;
  salary: string;
  description: string;
  requirements: string;
  url: string;
  publishedAt: string;
  startDate?: string;
  searchKeyword?: string;
}

const SEARCH_REQUEST_TIMEOUT_MS = 15_000;
const DETAIL_REQUEST_TIMEOUT_MS = 10_000;
const DETAIL_REQUEST_ATTEMPTS = 2;

const FEDERAL_STATE_NAMES: Record<string, string> = {
  BADEN_WUERTTEMBERG: 'Baden-Württemberg',
  BAYERN: 'Bayern',
  BERLIN: 'Berlin',
  BRANDENBURG: 'Brandenburg',
  BREMEN: 'Bremen',
  HAMBURG: 'Hamburg',
  HESSEN: 'Hessen',
  MECKLENBURG_VORPOMMERN: 'Mecklenburg-Vorpommern',
  NIEDERSACHSEN: 'Niedersachsen',
  NORDRHEIN_WESTFALEN: 'Nordrhein-Westfalen',
  RHEINLAND_PFALZ: 'Rheinland-Pfalz',
  SAARLAND: 'Saarland',
  SACHSEN: 'Sachsen',
  SACHSEN_ANHALT: 'Sachsen-Anhalt',
  SCHLESWIG_HOLSTEIN: 'Schleswig-Holstein',
  THUERINGEN: 'Thüringen',
};

function federalStateName(value: unknown): string {
  const raw = String(value || '').trim();
  return FEDERAL_STATE_NAMES[raw.toUpperCase()] || raw || 'Deutschland';
}

function trainingSalary(item: any): string {
  const firstYear = Number(item.ausbildungsverguetungJahr1);
  if (Number.isFinite(firstYear) && firstYear > 0) {
    return `${firstYear.toLocaleString('de-DE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })} € / Monat (1. Jahr)`;
  }
  return item.verguetung || 'Keine Angabe';
}

export async function fetchArbeitsagenturOffers(filters: SearchFilters = {}): Promise<{
  jobs: BAJobItem[];
  total: number;
  source: 'live_api' | 'fallback_db';
}> {
  const { 
    was = "", 
    wo = "", 
    umkreis, 
    bundesland = "", 
    contractType = "", 
    remote = false, 
    category = "", 
    page = 1, 
    limit = 25 
  } = filters;

  try {
    const queryParams = new URLSearchParams({
      angebotsart: '4', // 4 = Berufsausbildung (kat=0 on web.arbeitsagentur.de)
      page: page.toString(),
      size: limit.toString(),
    });

    if (was && was.trim()) {
      queryParams.set('was', was.trim());
    } else {
      queryParams.set('was', 'Ausbildung');
    }

    if (wo && wo.trim()) {
      queryParams.set('wo', wo.trim());
    }

    if (umkreis) {
      queryParams.set('umkreis', umkreis.toString());
    }

    if (contractType === 'Vollzeit') {
      queryParams.set('arbeitszeit', 'vz');
    } else if (contractType === 'Teilzeit') {
      queryParams.set('arbeitszeit', 'tz');
    }

    // The former /pc/v4/jobs search endpoint now returns 403. The provider's
    // current search response is exposed by v6 and uses a different field
    // shape, while job details remain available under v4.
    const apiUrl = `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs?${queryParams.toString()}`;

    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'X-API-Key': 'jobboerse-jobsuche',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(SEARCH_REQUEST_TIMEOUT_MS),
      next: { revalidate: 180 }, // Cache for 3 minutes
    });

    if (res.ok) {
      const data = await res.json();
      const rawJobs = data.ergebnisliste || data.stellenangebote || [];
      const totalCount = data.maxErgebnisse || rawJobs.length;

      const liveJobs: BAJobItem[] = rawJobs.map((item: any) => {
        const refnr = item.referenznummer || item.refnr || Math.random().toString(36).substring(7);
        const title = item.stellenangebotsTitel || item.titel || item.hauptberuf || item.beruf || 'Ausbildungsstelle';
        const company = item.firma || item.arbeitgeber || 'Deutsches Unternehmen';
        const address = item.stellenlokationen?.[0]?.adresse || item.arbeitsort || {};
        const location = address.ort || wo || 'Deutschland';
        const postalCode = String(address.plz || '');
        const federalState = federalStateName(address.region || address.land || bundesland);
        const isRemote = Boolean(item.homeofficemoeglich ?? item.homeoffice) ||
          title.toLowerCase().includes('remote') ||
          title.toLowerCase().includes('homeoffice');

        // Only expose an address provided by the source. Never guess a company address.
        const contactEmail = item.kontakt?.email || item.arbeitgeberMail || item.email || null;

        return {
          id: `BA-${refnr}`,
          externalId: `BA-${refnr}`,
          title: title,
          beruf: item.hauptberuf || item.beruf || title,
          company: company,
          contactEmail: contactEmail,
          contactEmailVerified: Boolean(contactEmail),
          location: location,
          postalCode: postalCode,
          federalState: federalState,
          category: category || detectCategory(title, item.beruf),
          contractType: 'Berufsausbildung',
          workTime: item.arbeitszeitVollzeit === false || item.arbeitszeit === 'tz'
            ? 'Teilzeit'
            : 'Vollzeit',
          remote: isRemote,
          salary: trainingSalary(item),
          description: `Ausbildungsstelle als ${item.hauptberuf || item.beruf || title} bei ${company} in ${location}. Beginn: ${item.eintrittszeitraum?.von || item.eintrittsdatum || 'nicht angegeben'}. Offizielles Angebot der Bundesagentur für Arbeit.`,
          requirements: 'Schulabschluss (Hauptschule, Realschule oder Abitur), Motivation, Lernbereitschaft und Teamfähigkeit.',
          url: `https://web.arbeitsagentur.de/ausbildungssuche/berufsausbildung-suche/detail/${refnr}`,
          publishedAt: item.datumErsteVeroeffentlichung || item.veroeffentlichungszeitraum?.von || item.aktuelleVeroeffentlichungsdatum || new Date().toISOString(),
          startDate: item.eintrittszeitraum?.von || item.eintrittsdatum || '',
          searchKeyword: was,
        };
      });

      const filteredJobs = liveJobs.filter((job) => {
        if (bundesland && job.federalState !== bundesland) return false;
        if (remote && !job.remote) return false;
        if (category && category !== 'Alle') {
          const wanted = category.toLowerCase();
          const actual = job.category.toLowerCase();
          if (!actual.includes(wanted)) return false;
        }
        return true;
      });

      return {
        jobs: filteredJobs,
        total: filteredJobs.length === liveJobs.length ? totalCount : filteredJobs.length,
        source: 'live_api',
      };
    }
  } catch (error) {
    console.warn('Official Arbeitsagentur REST API error, falling back:', error);
  }

  // Backup fallback with dedicated contact emails
  const fallbackJobs = getSampleFallbackJobs(filters);
  return {
    jobs: fallbackJobs,
    total: fallbackJobs.length,
    source: 'fallback_db',
  };
}

function detectCategory(title: string, beruf?: string): string {
  const combined = `${title} ${beruf || ''}`.toLowerCase();
  if (combined.includes('informatik') || combined.includes('software') || combined.includes('developer') || combined.includes('it') || combined.includes('system')) {
    return 'IT & Software';
  }
  if (combined.includes('kaufmann') || combined.includes('büro') || combined.includes('handels') || combined.includes('bank') || combined.includes('vertrieb')) {
    return 'Kaufmännisch';
  }
  if (combined.includes('mechatroniker') || combined.includes('elektroniker') || combined.includes('mechaniker') || combined.includes('handwerk') || combined.includes('anlagen')) {
    return 'Handwerk & Industrie';
  }
  if (combined.includes('pflege') || combined.includes('medizin') || combined.includes('gesundheit') || combined.includes('arzt') || combined.includes('apotheke')) {
    return 'Gesundheit & Pflege';
  }
  if (combined.includes('gestaltung') || combined.includes('medien') || combined.includes('design') || combined.includes('marketing')) {
    return 'Design & Medien';
  }
  return 'Berufsausbildung';
}

function getSampleFallbackJobs(filters: SearchFilters): BAJobItem[] {
  return [
    {
      id: "BA-10001-1003343846-S",
      externalId: "BA-10001-1003343846-S",
      title: "Fachinformatiker/in Systemintegration",
      company: "Ingenieurbüro Axel C. Rahn GmbH",
      contactEmail: null,
      contactEmailVerified: false,
      location: "Berlin",
      postalCode: "10785",
      federalState: "Berlin",
      category: "IT & Software",
      contractType: "Berufsausbildung",
      workTime: "Vollzeit",
      remote: true,
      salary: "1.250 € / Monat",
      description: "Ausbildung im Bereich Systemintegration, Netzwerk-Administration und IT-Infrastruktur in Berlin Tiergarten.",
      requirements: "Abitur oder Realschulabschluss, gute Computerkenntnisse.",
      url: "https://web.arbeitsagentur.de/ausbildungssuche/berufsausbildung-suche/detail/10001-1003343846-S",
      publishedAt: new Date().toISOString(),
      searchKeyword: filters.was || "Fachinformatiker"
    },
    {
      id: "BA-18024-100PJ000Reo32-S",
      externalId: "BA-18024-100PJ000Reo32-S",
      title: "Ausbildung zum Pflegefachassistenten (m/w/d)",
      company: "Wohnstift St. Clemens",
      contactEmail: null,
      contactEmailVerified: false,
      location: "Telgte",
      postalCode: "48291",
      federalState: "Nordrhein-Westfalen",
      category: "Gesundheit & Pflege",
      contractType: "Berufsausbildung",
      workTime: "Vollzeit",
      remote: false,
      salary: "1.340 € / Monat",
      description: "Generalistische Pflegeausbildung mit Betreuung von Senioren und kranken Menschen.",
      requirements: "Mittlerer Schulabschluss, Einfühlungsvermögen, Zuverlässigkeit.",
      url: "https://web.arbeitsagentur.de/ausbildungssuche/berufsausbildung-suche/detail/18024-100PJ000Reo32-S",
      publishedAt: new Date().toISOString(),
      searchKeyword: filters.was || "Pflege"
    }
  ];
}

function findEmailInDetails(value: unknown): string | null {
  if (typeof value === 'string') {
    const match = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match?.[0] || null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const email = findEmailInDetails(item);
      if (email) return email;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    for (const childValue of Object.values(value)) {
      const email = findEmailInDetails(childValue);
      if (email) return email;
    }
  }
  return null;
}

function readString(details: any, keys: string[]): string | null {
  for (const key of keys) {
    const value = details?.[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

export async function enrichArbeitsagenturOffer(job: BAJobItem): Promise<BAJobItem> {
  if (!job.externalId.startsWith('BA-')) {
    return { ...job, contactEmailVerified: Boolean(job.contactEmail) };
  }

  const reference = job.externalId.replace(/^BA-/, '');
  const encoded = Buffer.from(reference, 'utf8').toString('base64');
  for (let attempt = 0; attempt < DETAIL_REQUEST_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(
        `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails/${encodeURIComponent(encoded)}`,
        {
          headers: {
            'X-API-Key': 'jobboerse-jobsuche',
            Accept: 'application/json',
          },
          cache: 'no-store',
          signal: AbortSignal.timeout(DETAIL_REQUEST_TIMEOUT_MS),
        }
      );
      if (!response.ok) continue;

      const details = await response.json();
      const contactEmail = findEmailInDetails(details);
      return {
        ...job,
        contactEmail,
        contactEmailVerified: Boolean(contactEmail),
        description:
          readString(details, ['stellenangebotsBeschreibung', 'stellenbeschreibung']) ||
          job.description,
        requirements:
          readString(details, ['anforderungen', 'anforderungsprofil']) ||
          job.requirements,
      };
    } catch {
      // Retry a transient timeout or connection failure once.
    }
  }
  return { ...job, contactEmail: null, contactEmailVerified: false };
}
