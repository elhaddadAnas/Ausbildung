export interface SearchFilters {
  query?: string;
  location?: string;
  country?: string;
  contractType?: string;
  remote?: boolean;
  category?: string;
  internationalApplicants?: boolean;
  applicantCountry?: string;
  page?: number;
  limit?: number;
  // Backward-compatible aliases used by the shared UI and automation service.
  was?: string;
  wo?: string;
}

export type GlobalJobSource =
  | 'remoteok'
  | 'adzuna'
  | 'arbeitnow'
  | 'jooble'
  | 'combined'
  | 'unavailable';

export interface GlobalJobItem {
  id: string;
  externalId: string;
  title: string;
  company: string;
  contactEmail: string | null;
  contactEmailVerified: boolean;
  location: string;
  postalCode: string;
  country: string;
  category: string;
  contractType: string;
  workTime: string;
  remote: boolean;
  salary: string;
  description: string;
  requirements: string;
  url: string;
  publishedAt: string;
  acceptsInternationalApplicants: boolean;
  internationalApplicantEvidence: string | null;
  searchKeyword?: string;
  provider: string;
}

const COUNTRY_CODES: Record<string, string> = {
  australia: 'au',
  austria: 'at',
  belgium: 'be',
  brazil: 'br',
  canada: 'ca',
  france: 'fr',
  germany: 'de',
  india: 'in',
  italy: 'it',
  mexico: 'mx',
  morocco: 'ma',
  maroc: 'ma',
  netherlands: 'nl',
  'new zealand': 'nz',
  poland: 'pl',
  singapore: 'sg',
  spain: 'es',
  switzerland: 'ch',
  'south africa': 'za',
  'united kingdom': 'gb',
  'united states': 'us',
};

const COUNTRY_ALIASES: Record<string, string> = {
  maroc: 'morocco',
  morocco: 'morocco',
  deutschland: 'germany',
  allemagne: 'germany',
  france: 'france',
  espagne: 'spain',
  spain: 'spain',
  canada: 'canada',
  'united states': 'united states',
  usa: 'united states',
  'united kingdom': 'united kingdom',
  uk: 'united kingdom',
  worldwide: 'worldwide',
  global: 'worldwide',
};

const ADZUNA_COUNTRIES = new Set([
  'au', 'at', 'be', 'br', 'ca', 'fr', 'de', 'in', 'it', 'mx', 'nl', 'nz',
  'pl', 'sg', 'za', 'es', 'ch', 'gb', 'us',
]);

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function plainText(value: unknown): string {
  return text(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesTerm(value: string, term: string): boolean {
  return !term || value.toLowerCase().includes(term.toLowerCase());
}

function detectCategory(title: string, tags: string[] = []): string {
  const value = `${title} ${tags.join(' ')}`.toLowerCase();
  if (/(software|developer|engineer|data|security|cloud|devops|product)/.test(value)) return 'Technology';
  if (/(sales|account|business development|customer success)/.test(value)) return 'Sales';
  if (/(marketing|content|seo|growth|social media)/.test(value)) return 'Marketing';
  if (/(design|ux|ui|creative)/.test(value)) return 'Design';
  if (/(finance|accounting|analyst|banking)/.test(value)) return 'Finance';
  if (/(health|medical|nurse|care|pharma)/.test(value)) return 'Healthcare';
  if (/(operations|logistics|supply|warehouse)/.test(value)) return 'Operations';
  if (/(human resources|recruit|talent|people)/.test(value)) return 'Human Resources';
  return 'Other';
}

function normalizeCountry(value: string): string {
  const clean = value.trim();
  if (!clean) return '';
  const code = COUNTRY_CODES[clean.toLowerCase()];
  return code || clean.toLowerCase().slice(0, 2);
}

function comparableCountry(value: string): string {
  const clean = value.trim().toLowerCase();
  return COUNTRY_ALIASES[clean] || clean;
}

function matchesCountry(jobCountry: string, wantedCountry: string): boolean {
  const job = comparableCountry(jobCountry);
  const wanted = comparableCountry(wantedCountry);
  return job === 'worldwide' || job.includes(wanted) || wanted.includes(job);
}

function inferCountry(location: string, fallback = 'Worldwide'): string {
  const value = location.toLowerCase();
  const namedCountries = [
    'Morocco', 'Germany', 'France', 'Spain', 'Portugal', 'Netherlands', 'Belgium',
    'Switzerland', 'Austria', 'Canada', 'United States', 'United Kingdom',
    'Ireland', 'Poland', 'Italy', 'Sweden', 'Norway', 'Denmark', 'Finland',
    'United Arab Emirates', 'Saudi Arabia', 'South Africa', 'Singapore', 'Australia',
  ];
  const named = namedCountries.find((country) => value.includes(country.toLowerCase()));
  if (named) return named;
  if (/\b(maroc|casablanca|rabat|tanger|marrakech|agadir|f[eè]s|mekn[eè]s)\b/i.test(location)) {
    return 'Morocco';
  }
  if (/\b(berlin|munich|münchen|hamburg|frankfurt|cologne|köln|stuttgart|düsseldorf)\b/i.test(location)) {
    return 'Germany';
  }
  if (/worldwide|anywhere|global/i.test(location)) return 'Worldwide';
  return fallback;
}

function internationalEligibility(input: {
  description?: string;
  requirements?: string;
  location?: string;
  remote?: boolean;
  explicitVisaSponsorship?: boolean;
}): { accepted: boolean; evidence: string | null } {
  if (input.explicitVisaSponsorship) {
    return { accepted: true, evidence: 'Visa sponsorship explicitly offered' };
  }

  const value = plainText(
    `${input.description || ''} ${input.requirements || ''} ${input.location || ''}`
  ).toLowerCase();
  if (
    /no (?:visa )?sponsorship|unable to sponsor|must (?:already )?(?:have|hold) (?:the )?(?:right|authorization) to work|must (?:live|reside|be located) in/.test(value)
  ) {
    return { accepted: false, evidence: null };
  }

  const evidencePatterns: Array<[RegExp, string]> = [
    [/\bvisa sponsorship\b|\bsponsor(?:ing|ed)? (?:a |your )?visa\b/, 'Visa sponsorship mentioned'],
    [/\brelocation (?:support|assistance|package|provided)\b|\bfull relocation\b/, 'Relocation support mentioned'],
    [/\binternational (?:applicants|candidates) (?:are )?(?:welcome|accepted|encouraged)\b/, 'International candidates welcomed'],
    [/\bopen to (?:applicants|candidates) (?:from )?(?:all countries|worldwide|globally)\b/, 'Applicants accepted worldwide'],
    [/\bwork from anywhere\b|\bremote from anywhere\b|\banywhere in the world\b/, 'Work from anywhere'],
  ];
  for (const [pattern, evidence] of evidencePatterns) {
    if (pattern.test(value)) return { accepted: true, evidence };
  }
  if (input.remote && /^worldwide$/i.test(text(input.location))) {
    return { accepted: true, evidence: 'Worldwide remote role' };
  }
  return { accepted: false, evidence: null };
}

async function fetchRemoteOk(filters: SearchFilters): Promise<GlobalJobItem[]> {
  const query = text(filters.query || filters.was);
  const location = text(filters.location || filters.wo);
  const response = await fetch('https://remoteok.com/api', {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Global Job Finder AI/1.0 (job search application)',
    },
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`Remote OK returned ${response.status}`);

  const payload = await response.json();
  if (!Array.isArray(payload)) return [];

  return payload
    .filter((item: any) => item && (item.position || item.company) && item.id)
    .map((item: any): GlobalJobItem => {
      const tags = Array.isArray(item.tags) ? item.tags.map(String) : [];
      const jobLocation = text(item.location, 'Worldwide');
      const salaryMin = Number(item.salary_min) || 0;
      const salaryMax = Number(item.salary_max) || 0;
      const salary = salaryMin || salaryMax
        ? `$${salaryMin.toLocaleString()} – $${salaryMax.toLocaleString()}`
        : 'Not specified';
      const description = plainText(item.description);
      const eligibility = internationalEligibility({
        description,
        requirements: tags.join(', '),
        location: jobLocation,
        remote: true,
      });
      return {
        id: `REMOTEOK-${item.id}`,
        externalId: `REMOTEOK-${item.id}`,
        title: text(item.position, 'Open position'),
        company: text(item.company, 'Company not disclosed'),
        contactEmail: null,
        contactEmailVerified: false,
        location: jobLocation,
        postalCode: '',
        country: jobLocation === 'Worldwide' ? 'Worldwide' : jobLocation,
        category: detectCategory(text(item.position), tags),
        contractType: 'Employment',
        workTime: 'Full-time',
        remote: true,
        salary,
        description,
        requirements: tags.join(', '),
        url: text(item.apply_url || item.url, `https://remoteok.com/remote-jobs/${item.id}`),
        publishedAt: text(item.date, new Date().toISOString()),
        acceptsInternationalApplicants: eligibility.accepted,
        internationalApplicantEvidence: eligibility.evidence,
        searchKeyword: query,
        provider: 'Remote OK',
      };
    })
    .filter((job: GlobalJobItem) => {
      const searchable = `${job.title} ${job.company} ${job.category} ${job.requirements}`;
      return includesTerm(searchable, query) && includesTerm(job.location, location);
    });
}

async function fetchAdzuna(filters: SearchFilters): Promise<GlobalJobItem[]> {
  const appId = process.env.ADZUNA_APP_ID?.trim();
  const appKey = process.env.ADZUNA_APP_KEY?.trim();
  if (!appId || !appKey) return [];

  const query = text(filters.query || filters.was);
  const location = text(filters.location || filters.wo);
  const country = normalizeCountry(text(filters.country, 'United States'));
  if (!ADZUNA_COUNTRIES.has(country)) return [];
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(filters.limit) || 25));
  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(limit),
    content_type: 'application/json',
  });
  if (query) params.set('what', query);
  if (location) params.set('where', location);

  const response = await fetch(
    `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country)}/search/${page}?${params}`,
    { headers: { Accept: 'application/json' }, next: { revalidate: 300 } }
  );
  if (!response.ok) throw new Error(`Adzuna returned ${response.status}`);
  const payload = await response.json();
  const results = Array.isArray(payload?.results) ? payload.results : [];

  return results.map((item: any): GlobalJobItem => {
    const min = Number(item.salary_min) || 0;
    const max = Number(item.salary_max) || 0;
    const jobCountry = text(item.location?.area?.[0], text(filters.country, 'Worldwide'));
    const description = plainText(item.description);
    const remote = /remote|home.?based/i.test(`${item.title} ${item.description}`);
    const eligibility = internationalEligibility({
      description,
      location: text(item.location?.display_name, location || jobCountry),
      remote,
    });
    return {
      id: `ADZUNA-${country}-${item.id}`,
      externalId: `ADZUNA-${country}-${item.id}`,
      title: text(item.title, 'Open position'),
      company: text(item.company?.display_name, 'Company not disclosed'),
      contactEmail: null,
      contactEmailVerified: false,
      location: text(item.location?.display_name, location || jobCountry),
      postalCode: '',
      country: jobCountry,
      category: text(item.category?.label, detectCategory(text(item.title))),
      contractType: text(item.contract_type, 'Employment'),
      workTime: text(item.contract_time, 'Not specified'),
      remote,
      salary: min || max ? `${min.toLocaleString()} – ${max.toLocaleString()}` : 'Not specified',
      description,
      requirements: '',
      url: text(item.redirect_url),
      publishedAt: text(item.created, new Date().toISOString()),
      acceptsInternationalApplicants: eligibility.accepted,
      internationalApplicantEvidence: eligibility.evidence,
      searchKeyword: query,
      provider: 'Adzuna',
    };
  });
}

async function fetchArbeitnow(filters: SearchFilters): Promise<GlobalJobItem[]> {
  const query = text(filters.query || filters.was);
  const location = text(filters.location || filters.wo);
  const page = Math.max(1, Number(filters.page) || 1);
  const params = new URLSearchParams({ page: String(page) });
  if (filters.internationalApplicants) params.set('visa_sponsorship', 'true');

  const response = await fetch(`https://www.arbeitnow.com/api/job-board-api?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Global Job Finder AI/1.0 (job search application)',
    },
    next: { revalidate: 300 },
  });
  if (!response.ok) throw new Error(`Arbeitnow returned ${response.status}`);

  const payload = await response.json();
  const results = Array.isArray(payload?.data) ? payload.data : [];
  return results
    .map((item: any): GlobalJobItem => {
      const tags = Array.isArray(item.tags) ? item.tags.map(String) : [];
      const jobTypes = Array.isArray(item.job_types) ? item.job_types.map(String) : [];
      const jobLocation = text(item.location, 'Europe');
      const description = plainText(item.description);
      const remote = Boolean(item.remote);
      const eligibility = internationalEligibility({
        description,
        requirements: tags.join(', '),
        location: jobLocation,
        remote,
        explicitVisaSponsorship: Boolean(filters.internationalApplicants),
      });
      const slug = text(item.slug, String(item.created_at || item.title));
      return {
        id: `ARBEITNOW-${slug}`,
        externalId: `ARBEITNOW-${slug}`,
        title: text(item.title, 'Open position'),
        company: text(item.company_name, 'Company not disclosed'),
        contactEmail: null,
        contactEmailVerified: false,
        location: jobLocation,
        postalCode: '',
        country: inferCountry(jobLocation, 'Europe'),
        category: detectCategory(text(item.title), tags),
        contractType: text(jobTypes[0], 'Employment'),
        workTime: jobTypes.join(', ') || 'Not specified',
        remote,
        salary: 'Not specified',
        description,
        requirements: tags.join(', '),
        url: text(item.url),
        publishedAt: item.created_at
          ? new Date(Number(item.created_at) * 1000).toISOString()
          : new Date().toISOString(),
        acceptsInternationalApplicants: eligibility.accepted,
        internationalApplicantEvidence: eligibility.evidence,
        searchKeyword: query,
        provider: 'Arbeitnow',
      };
    })
    .filter((job: GlobalJobItem) => {
      const searchable = `${job.title} ${job.company} ${job.category} ${job.requirements} ${job.description}`;
      return includesTerm(searchable, query) && includesTerm(job.location, location);
    });
}

async function fetchJooble(filters: SearchFilters): Promise<GlobalJobItem[]> {
  const apiKey = process.env.JOOBLE_API_KEY?.trim();
  if (!apiKey) return [];

  const query = text(filters.query || filters.was);
  const requestedLocation = text(filters.location || filters.wo);
  const requestedCountry = text(filters.country);
  const location = requestedLocation ||
    (requestedCountry && requestedCountry !== 'All' ? requestedCountry : 'Morocco');
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(50, Math.max(1, Number(filters.limit) || 25));

  const response = await fetch(`https://jooble.org/api/${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      keywords: query,
      location,
      radius: '80',
      page: String(page),
      ResultOnPage: String(limit),
      companysearch: 'false',
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Jooble returned ${response.status}`);

  const payload = await response.json();
  const results = Array.isArray(payload?.jobs) ? payload.jobs : [];
  return results.map((item: any): GlobalJobItem => {
    const jobLocation = text(item.location, location || 'Worldwide');
    const description = plainText(item.snippet);
    const remote = /remote|télétravail|work from home|à distance/i.test(
      `${item.title} ${jobLocation} ${description}`
    );
    const eligibility = internationalEligibility({
      description,
      location: jobLocation,
      remote,
    });
    const source = text(item.source);
    const id = text(String(item.id || ''), `${item.title}-${item.company}-${jobLocation}`);
    return {
      id: `JOOBLE-${id}`,
      externalId: `JOOBLE-${id}`,
      title: text(item.title, 'Open position'),
      company: text(item.company, 'Company not disclosed'),
      contactEmail: null,
      contactEmailVerified: false,
      location: jobLocation,
      postalCode: '',
      country: inferCountry(jobLocation, requestedCountry || 'Morocco'),
      category: detectCategory(text(item.title)),
      contractType: text(item.type, 'Employment'),
      workTime: text(item.type, 'Not specified'),
      remote,
      salary: text(item.salary, 'Not specified'),
      description,
      requirements: '',
      url: text(item.link),
      publishedAt: text(item.updated, new Date().toISOString()),
      acceptsInternationalApplicants: eligibility.accepted,
      internationalApplicantEvidence: eligibility.evidence,
      searchKeyword: query,
      provider: source ? `Jooble · ${source}` : 'Jooble',
    };
  });
}

export async function fetchGlobalJobs(filters: SearchFilters = {}): Promise<{
  jobs: GlobalJobItem[];
  total: number;
  source: GlobalJobSource;
  providers: string[];
}> {
  const results = await Promise.allSettled([
    fetchRemoteOk(filters),
    fetchAdzuna(filters),
    fetchArbeitnow(filters),
    fetchJooble(filters),
  ]);
  const remoteJobs = results[0].status === 'fulfilled' ? results[0].value : [];
  const adzunaJobs = results[1].status === 'fulfilled' ? results[1].value : [];
  const arbeitnowJobs = results[2].status === 'fulfilled' ? results[2].value : [];
  const joobleJobs = results[3].status === 'fulfilled' ? results[3].value : [];
  const unique = new Map<string, GlobalJobItem>();

  [...joobleJobs, ...adzunaJobs, ...arbeitnowJobs, ...remoteJobs].forEach((job) => {
    const dedupeKey = `${job.title}|${job.company}|${job.location}`.toLowerCase().replace(/\s+/g, ' ');
    if (!unique.has(dedupeKey)) unique.set(dedupeKey, job);
  });
  let jobs = Array.from(unique.values());
  if (filters.remote) jobs = jobs.filter((job) => job.remote);
  if (filters.country && filters.country !== 'All') {
    jobs = jobs.filter((job) => matchesCountry(job.country, filters.country!));
  }
  if (filters.internationalApplicants) {
    const applicantCountry = text(filters.applicantCountry, 'Morocco');
    jobs = jobs.filter(
      (job) =>
        job.acceptsInternationalApplicants &&
        (
          comparableCountry(job.country) === 'worldwide' ||
          !matchesCountry(job.country, applicantCountry)
        )
    );
  }
  if (filters.category && filters.category !== 'All') {
    jobs = jobs.filter((job) => job.category.toLowerCase().includes(filters.category!.toLowerCase()));
  }
  if (filters.contractType && filters.contractType !== 'Any') {
    const wantedType = filters.contractType.toLowerCase();
    jobs = jobs.filter(
      (job) =>
        job.contractType.toLowerCase().includes(wantedType) ||
        job.workTime.toLowerCase().includes(wantedType)
    );
  }

  const limit = Math.min(50, Math.max(1, Number(filters.limit) || 25));
  jobs.sort((a, b) => {
    if (filters.country && filters.country !== 'All') {
      const aExact = comparableCountry(a.country) === comparableCountry(filters.country) ? 1 : 0;
      const bExact = comparableCountry(b.country) === comparableCountry(filters.country) ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
    }
    return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
  });
  jobs = jobs.slice(0, limit);
  const activeSources: Array<[GlobalJobSource, string, number]> = [
    ['jooble', 'Jooble', joobleJobs.length],
    ['adzuna', 'Adzuna', adzunaJobs.length],
    ['arbeitnow', 'Arbeitnow', arbeitnowJobs.length],
    ['remoteok', 'Remote OK', remoteJobs.length],
  ];
  const available = activeSources.filter(([, , count]) => count > 0);
  const source: GlobalJobSource =
    available.length > 1 ? 'combined' : available[0]?.[0] || 'unavailable';
  const providers = available.map(([, label]) => label);

  return { jobs, total: jobs.length, source, providers };
}

export async function enrichGlobalJob(job: GlobalJobItem): Promise<GlobalJobItem> {
  // Public aggregation feeds normally expose an application URL, not a recruiter
  // email. Never guess or scrape an address: SMTP auto-apply only proceeds when a
  // configured provider supplies a verified contact email.
  return {
    ...job,
    contactEmail: job.contactEmail || null,
    contactEmailVerified: Boolean(job.contactEmail && job.contactEmailVerified),
  };
}
