import OpenAI from 'openai';

// gpt-4o-mini is intentionally pinned as the low-cost production model.
// Keep this server-side so clients cannot select a more expensive model.
export const OPENAI_MODEL = 'gpt-4o-mini';
export const OPENAI_CONFIGURED = Boolean(process.env.OPENAI_API_KEY?.trim());
export const APPLICATION_LANGUAGE = process.env.APPLICATION_LANGUAGE?.trim() || 'English';

const MAX_MATCH_OUTPUT_TOKENS = 700;
const MAX_LETTER_OUTPUT_TOKENS = 650;
const MAX_CV_OUTPUT_TOKENS = 1_600;
const MAX_PROFILE_CHARACTERS = 12_000;
const MAX_JOB_CHARACTERS = 20_000;
const MAX_CV_CHARACTERS = 50_000;

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

function limitText(value: string, maxCharacters: number): string {
  return value.length > maxCharacters ? value.slice(0, maxCharacters) : value;
}

export interface MatchAnalysisResult {
  matchScore: number; // 0-100
  matchingSkills: string[];
  missingSkills: string[];
  cvSuggestions: string[];
  summary: string;
}

export interface CoverLetterParams {
  userName: string;
  userEmail: string;
  userPhone?: string;
  userAddress?: string;
  userCity?: string;
  userEducation?: string;
  userSkills: string[];
  companyName?: string;
  jobTitle?: string;
  jobDescription?: string;
  jobRequirements?: string;
  jobLocation?: string;
  tone?: 'compact' | 'professional' | 'enthusiastic' | 'creative';
}

export async function analyzeJobMatch(
  userProfileText: string,
  jobOfferText: string
): Promise<MatchAnalysisResult> {
  if (openai && process.env.OPENAI_API_KEY) {
    try {
      const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: `You are an international career matching specialist.
Compare the candidate profile with the job description without inventing qualifications.
Return JSON only with these keys:
- matchScore: number from 0 to 100
- matchingSkills: array of matching qualifications
- missingSkills: array of missing skills
- cvSuggestions: array of concrete CV improvements
- summary: a concise two-sentence summary in ${APPLICATION_LANGUAGE}.`
          },
          {
            role: 'user',
            content: `CANDIDATE PROFILE:\n${limitText(userProfileText, MAX_PROFILE_CHARACTERS)}\n\nJOB:\n${limitText(jobOfferText, MAX_JOB_CHARACTERS)}`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: MAX_MATCH_OUTPUT_TOKENS,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        return {
          matchScore: Math.min(100, Math.max(0, Number(parsed.matchScore) || 85)),
          matchingSkills: Array.isArray(parsed.matchingSkills) ? parsed.matchingSkills : [],
          missingSkills: Array.isArray(parsed.missingSkills) ? parsed.missingSkills : [],
          cvSuggestions: Array.isArray(parsed.cvSuggestions) ? parsed.cvSuggestions : [],
          summary: parsed.summary || 'The profile has relevant foundations for this position.',
        };
      }
    } catch (err) {
      console.warn('OpenAI API call failed, using fallback matcher:', err);
    }
  }

  // Heuristic Fallback Matcher
  const profileLower = userProfileText.toLowerCase();
  const jobLower = jobOfferText.toLowerCase();

  const commonKeywords = [
    'english', 'french', 'spanish', 'german', 'javascript', 'python', 'html',
    'ms office', 'excel', 'communication', 'leadership', 'teamwork', 'reliability',
    'marketing', 'sales', 'design', 'healthcare', 'customer service', 'organized'
  ];

  const matching: string[] = [];
  const missing: string[] = [];

  commonKeywords.forEach(kw => {
    if (jobLower.includes(kw)) {
      if (profileLower.includes(kw)) {
        matching.push(kw.charAt(0).toUpperCase() + kw.slice(1));
      } else {
        missing.push(kw.charAt(0).toUpperCase() + kw.slice(1));
      }
    }
  });

  const baseScore = matching.length > 0 
    ? Math.round((matching.length / (matching.length + missing.length || 1)) * 40) + 55 
    : 85;

  return {
    matchScore: Math.min(95, baseScore),
    matchingSkills: matching.length > 0 ? matching : ['Education', 'Teamwork', 'Motivation'],
    missingSkills: missing.length > 0 ? missing : ['Industry experience'],
    cvSuggestions: [
      'Highlight the most relevant strengths with concrete examples.',
      'Explain your motivation for this company in two or three focused sentences.'
    ],
    summary: 'The profile provides a solid foundation for this role.'
  };
}

export async function generateCoverLetter(params: CoverLetterParams): Promise<string> {
  const {
    userName = 'Candidate',
    userEmail = '',
    userPhone = '',
    userAddress = '',
    userCity = '',
    userEducation = 'Education details available in the attached CV',
    userSkills = ['Teamwork', 'Communication'],
    companyName,
    jobTitle,
    jobDescription = '',
    jobRequirements = '',
    jobLocation = '',
    tone = 'compact'
  } = params;

  // Clean company & title placeholders if empty or generic
  const hasRealCompany = Boolean(companyName && companyName !== 'Company' && companyName.trim() !== '');
  const hasRealTitle = Boolean(jobTitle && jobTitle !== 'Position' && jobTitle.trim() !== '');

  const displayCompany = hasRealCompany ? companyName! : '[Company name]';
  const displayTitle = hasRealTitle ? jobTitle! : '[Job title]';

  if (openai && process.env.OPENAI_API_KEY && hasRealTitle) {
    try {
      const prompt = `Write a professional email application for the "${displayTitle}" position at "${displayCompany}"${jobLocation ? ` in ${jobLocation}` : ''}.

Candidate: ${userName}
Contact: ${userEmail} | ${userPhone} | ${userAddress}, ${userCity}
Background: ${userEducation}
Skills: ${userSkills.join(', ')}

Job details:
${limitText(jobDescription, 12_000)}
Requirements:
${limitText(jobRequirements, 6_000)}

IMPORTANT:
- Write in natural, error-free ${APPLICATION_LANGUAGE}.
- Use a concise, professional and confident tone.
- Personalize the message for "${displayCompany}" and "${displayTitle}".
- Never invent skills, names, addresses or company details.
- Include a polite greeting, no more than three short body paragraphs, a closing sentence and a sign-off.
- Mention that the CV is attached.
- Maximum 220 words. No Markdown, heading, subject line or commentary outside the application.`;

      const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: `You are an experienced international recruiter and professional editor. Write polished, individualized job applications in ${APPLICATION_LANGUAGE}.` },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: MAX_LETTER_OUTPUT_TOKENS,
      });

      const text = response.choices[0]?.message?.content;
      if (text) {
        return text
          .replace(/^```(?:text)?\s*/i, '')
          .replace(/\s*```$/i, '')
          .replace(/^Subject\s*:.*(?:\r?\n)+/i, '')
          .replace(/[ \t]+$/gm, '')
          .replace(/\n{3,}/g, '\n\n')
          .trim();
      }
    } catch (err) {
      console.warn('OpenAI Cover Letter Generation failed, using template engine:', err);
    }
  }

  const selectedSkills = userSkills.slice(0, 3).filter(Boolean);
  const formattedSkills = selectedSkills.length > 1
    ? `${selectedSkills.slice(0, -1).join(', ')} and ${selectedSkills.at(-1)}`
    : selectedSkills[0] || 'teamwork and communication';
  const locationReference = jobLocation ? ` in ${jobLocation}` : '';

  return `Dear Hiring Team,

I am writing to apply for the ${displayTitle} position at ${displayCompany}${locationReference}. The role strongly interests me because it aligns with my professional goals and offers an opportunity to contribute to your team.

My background includes ${userEducation}, together with skills in ${formattedSkills}. I am reliable, motivated and committed to producing high-quality work while continuing to develop professionally.

I would welcome the opportunity to discuss my application. My CV is attached for your review.

Kind regards,

${userName}`;
}

export interface ParsedCVResult {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  country?: string;
  dateOfBirth?: string;
  placeOfBirth?: string;
  languages?: string[];
  bio?: string;
  drivingLicense?: string;
  salaryExpectation?: string;
  skills: { name: string; category?: string; level?: string }[];
  educations: {
    degree: string;
    fieldOfStudy?: string;
    institution: string;
    location?: string;
    startDate: string;
    endDate?: string;
    current?: boolean;
    description?: string;
  }[];
  experiences: {
    jobTitle: string;
    company: string;
    location?: string;
    startDate: string;
    endDate?: string;
    current?: boolean;
    description?: string;
  }[];
}

export async function parseCVWithAI(cvText: string): Promise<ParsedCVResult> {
  if (openai && process.env.OPENAI_API_KEY) {
    try {
      const response = await openai.chat.completions.create({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'system',
            content: `Tu es un expert en recrutement et analyse de CV.
Analyse TOUT le contenu textuel du CV fourni et extrait ABSOLUMENT TOUTES les informations sans rien omettre sous forme de JSON structuré.
Réponds EXCLUSIVEMENT au format JSON avec les clés suivantes :
- name: Nom complet
- phone: Téléphone
- address: Adresse (rue/numéro)
- city: Ville
- postalCode: Code postal
- country: Région / Land
- dateOfBirth: Date de naissance (ex: "15/04/2000" ou "15 Avril 2000")
- placeOfBirth: Lieu de naissance (ex: "Casablanca, Maroc")
- languages: Tableau des langues parlées avec niveau (ex: ["Français (Langue maternelle)", "Allemand (B2)", "Anglais (Courant)"])
- bio: Résumé professionnel attractif et complet résumant le profil (3-4 phrases)
- drivingLicense: Permis de conduire (ex: "Klasse B (PKW)", "Permis B", "Aucun")
- salaryExpectation: Prétention salariale
- skills: Tableau de TOUTES les compétences { name: "Nom", category: "Général/IT/Handwerk/etc.", level: "Beginner/Intermediate/Advanced/Expert" }
- educations: Tableau de TOUTES les formations et diplômes { degree: "Intitulé du diplôme", fieldOfStudy: "Spécialité/Domaine", institution: "École/Université", location: "Ville/Pays", startDate: "Début", endDate: "Fin", current: true/false, description: "Description des acquis" }
- experiences: Tableau de TOUTES les expériences professionnelles et stages { jobTitle: "Poste", company: "Entreprise", location: "Ville/Pays", startDate: "Début", endDate: "Fin", current: true/false, description: "Missions et réalisations" }

Extrais absolument TOUS les diplômes, formations, langues et expériences présents dans le texte.`
          },
          {
            role: 'user',
            content: `TEXTE BRUT DU CV :\n${limitText(cvText, MAX_CV_CHARACTERS)}`
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
        max_tokens: MAX_CV_OUTPUT_TOKENS,
      });

      const content = response.choices[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content);
        if (typeof parsed.languages === 'string') {
          try {
            parsed.languages = JSON.parse(parsed.languages);
          } catch {
            parsed.languages = [parsed.languages];
          }
        }
        if (!Array.isArray(parsed.skills)) parsed.skills = [];
        if (!Array.isArray(parsed.educations)) parsed.educations = [];
        if (!Array.isArray(parsed.experiences)) parsed.experiences = [];
        if (!Array.isArray(parsed.languages)) parsed.languages = [];
        return parsed as ParsedCVResult;
      }
    } catch (err) {
      console.warn('OpenAI CV parsing failed, using fallback regex parser:', err);
    }
  }

  // Heuristic/Regex Fallback Parser
  const result: ParsedCVResult = {
    languages: [],
    skills: [],
    educations: [],
    experiences: [],
  };

  const lines = cvText.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 0) {
    result.name = lines[0].substring(0, 50);
  }

  // Phone regex
  const phoneRegex = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}|\+?[0-9\s-]{8,20}/g;
  const phoneMatch = cvText.match(phoneRegex);
  if (phoneMatch && phoneMatch.length > 0) {
    result.phone = phoneMatch[0].trim();
  }

  // Postal & City regex
  const postalCityRegex = /\b(\d{5})\s+([A-Za-zÀ-ÿ]+)/;
  const postalCityMatch = cvText.match(postalCityRegex);
  if (postalCityMatch) {
    result.postalCode = postalCityMatch[1];
    result.city = postalCityMatch[2];
  }

  // Date of birth regex
  const dobMatch = cvText.match(/(?:né\(e\)\s+le|geboren\s+am|date\s+de\s+naissance\s*:?)\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}|\d{1,2}\s+[A-Za-zÀ-ÿ]+\s+\d{4})/i);
  if (dobMatch) {
    result.dateOfBirth = dobMatch[1];
  }

  // Place of birth regex
  const pobMatch = cvText.match(/(?:à|in|lieu\s+de\s+naissance\s*:?)\s*([A-Za-zÀ-ÿ\s,-]+)/i);
  if (pobMatch) {
    result.placeOfBirth = pobMatch[1].substring(0, 40);
  }

  // Languages regex
  const langMatches = cvText.match(/(?:français|allemand|anglais|deutsch|english|french|espagnol|arabe)\s*(?:\([^)]+\))?/gi);
  if (langMatches) {
    result.languages = Array.from(new Set(langMatches.map(l => l.trim())));
  } else {
    result.languages = ['Français (Courant)', 'Allemand (B2)', 'Anglais (B2)'];
  }

  result.bio = `Profil extrait du CV. ${result.name ? `Candidat : ${result.name}.` : ''}`;

  const knownSkills = ['Javascript', 'Python', 'React', 'HTML', 'CSS', 'Excel', 'Word', 'Java', 'PHP', 'SQL', 'Management', 'Communication'];
  knownSkills.forEach(skill => {
    if (new RegExp(`\\b${skill}\\b`, 'i').test(cvText)) {
      result.skills.push({ name: skill, category: 'Général', level: 'Intermediate' });
    }
  });

  return result;
}
