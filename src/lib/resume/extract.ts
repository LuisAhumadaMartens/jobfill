import { isUSState } from '../matching/synonyms.ts';

export interface ParsedDate { year?: number; month?: number; present?: boolean }

export interface Role {
  title: string;
  company: string;
  location: string;
  start: ParsedDate | null;
  end: ParsedDate | null;
  current: boolean;
  raw: string;
}

export interface EducationEntry {
  degree: string;
  major: string;
  school: string;
  graduation: ParsedDate | null;
  gpa: string;
  raw: string;
}

export interface ExtractResult {
  profile: Record<string, string>;
  experience: Role[];
  education: EducationEntry[];
  skills: string[];
  summary: string;
  sections: Record<string, string[]>;
  warnings: string[];
  lineCount: number;
}

const RX = {
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  phone: /(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/,
  linkedin: /(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/(?:in|pub)\/[A-Za-z0-9\-_%]+\/?/i,
  github: /(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9\-_.]+\/?/i,
  twitter: /(?:https?:\/\/)?(?:www\.)?(?:twitter|x)\.com\/[A-Za-z0-9_]+\/?/i,
  url: /(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)+(?:\/[^\s|,]*)?/,
  cityState: /\b([A-Z][A-Za-z.'-]+(?:\s[A-Z][A-Za-z.'-]+)*),\s*([A-Z]{2}|[A-Z][a-z]+)\b/,
  gpa: /\bGPA[:\s]*([0-4](?:\.\d{1,2})?)(?:\s*\/\s*([0-4](?:\.\d{1,2})?))?/i,
  postal: /\b\d{5}(?:-\d{4})?\b/
};

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12
};

const SECTION_ALIASES: Array<[string, string[]]> = [
  ['summary', ['summary', 'profile', 'objective', 'about me', 'professional summary']],
  ['skills', ['skills', 'technical skills', 'technologies', 'core competencies', 'tech stack']],
  ['experience', ['experience', 'work experience', 'professional experience', 'employment', 'employment history', 'work history']],
  ['projects', ['projects', 'personal projects', 'selected projects', 'side projects']],
  ['education', ['education', 'academics', 'academic background']],
  ['leadership', ['leadership', 'activities', 'involvement', 'volunteering', 'community']],
  ['awards', ['awards', 'honors', 'achievements', 'certifications', 'publications']]
];

const DEGREE_WORDS = /\b(b\.?s\.?|b\.?a\.?|bachelor(?:'s)?|m\.?s\.?|m\.?a\.?|master(?:'s)?|mba|ph\.?d\.?|doctorate|associate(?:'s)?|a\.?a\.?s?\.?)\b/i;
const SCHOOL_WORDS = /\b(university|college|institute|academy|school|polytechnic)\b/i;
const PRESENT = /\b(present|current|now|ongoing)\b/i;

const US_MENTION = /\b(united states|u\.?s\.?a?\.?|american citizen|u\.?s\.? (citizen|permanent resident))\b/i;

const NAME_STOPWORDS = /\b(resume|curriculum|vitae|cv|phone|email|address|portfolio|linkedin|github|profile|summary)\b/i;

function toLines(text: string): string[] {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

function isSectionHeading(line: string): string | null {
  const bare = line.replace(/[^A-Za-z ]/g, '').trim().toLowerCase();
  if (!bare || bare.length > 34) return null;
  const words = bare.split(' ').filter(Boolean);
  if (words.length > 4) return null;
  for (const [key, aliases] of SECTION_ALIASES) {
    if (aliases.includes(bare)) return key;
  }

  const looksLikeHeading = line === line.toUpperCase() && words.length <= 3 && line.length < 30;
  return looksLikeHeading ? bare.replace(/\s+/g, '') : null;
}

function splitSections(lines: string[]): Record<string, string[]> {
  const sections: Record<string, string[]> = { header: [] };
  let current = 'header';
  for (const line of lines) {
    const heading = isSectionHeading(line);
    if (heading) {
      current = heading;
      if (!sections[current]) sections[current] = [];
      continue;
    }
    if (!sections[current]) sections[current] = [];
    sections[current].push(line);
  }
  return sections;
}

function firstMatch(text: string, rx: RegExp): string {
  const m = String(text || '').match(rx);
  return m ? m[0] : '';
}

function tidyUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.replace(/[).,;]+$/, '');
  return /^https?:\/\//i.test(trimmed) ? trimmed : 'https://' + trimmed;
}

function findName(lines: string[], email?: string): string {
  const head = lines.slice(0, 8);
  for (const line of head) {
    if (line.length > 48 || line.length < 4) continue;
    if (RX.email.test(line) || RX.phone.test(line) || /[|@]/.test(line)) continue;
    if (NAME_STOPWORDS.test(line)) continue;
    if (/\d/.test(line)) continue;
    const words = line.split(' ').filter(Boolean);
    if (words.length < 2 || words.length > 4) continue;

    const titled = words.every((w) => /^[A-Z][A-Za-z.'-]*$/.test(w));
    const caps = line === line.toUpperCase() && /^[A-Z .'-]+$/.test(line);
    if (titled || caps) {
      return caps ? line.split(' ').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ') : line;
    }
  }

  if (email) {
    const local = email.split('@')[0].replace(/\d+/g, '');
    const parts = local.split(/[._-]+/).filter((p) => p.length > 1);
    if (parts.length >= 2) return parts.map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
  }
  return '';
}

function splitName(fullName: string): { firstName?: string; middleName?: string; lastName?: string } {
  const parts = String(fullName || '').split(' ').filter(Boolean);
  if (!parts.length) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  const SUFFIX = /^(jr|sr|ii|iii|iv|phd|md)\.?$/i;
  const clean = parts.filter((p) => !SUFFIX.test(p));
  return {
    firstName: clean[0],
    middleName: clean.length > 2 ? clean.slice(1, -1).join(' ') : '',
    lastName: clean.length > 1 ? clean[clean.length - 1] : ''
  };
}

function normalizePhone(raw: string): string {
  if (!raw) return '';
  const digits = raw.replace(/[^\d]/g, '');
  if (digits.length === 10) return '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  if (digits.length === 11 && digits[0] === '1') {
    return '+1 (' + digits.slice(1, 4) + ') ' + digits.slice(4, 7) + '-' + digits.slice(7);
  }
  return raw.trim();
}

function parseDate(token: string): ParsedDate | null {
  if (!token) return null;
  if (PRESENT.test(token)) return { present: true };
  const named = token.match(/\b([A-Za-z]{3,9})\.?\s+(\d{4})\b/);
  if (named) {
    const month = MONTHS[named[1].slice(0, 3).toLowerCase()];
    if (month) return { year: Number(named[2]), month };
  }
  const numeric = token.match(/\b(\d{1,2})[/-](\d{4})\b/);
  if (numeric) return { year: Number(numeric[2]), month: Number(numeric[1]) };
  const year = token.match(/\b(19|20)\d{2}\b/);
  return year ? { year: Number(year[0]) } : null;
}

function parseDateRange(line: string): { start: ParsedDate | null; end: ParsedDate | null; text: string } | null {
  const range = line.match(/((?:[A-Za-z]{3,9}\.?\s+)?(?:\d{1,2}[/-])?(?:19|20)\d{2})\s*(?:[-\u2013\u2014]|to)\s*((?:[A-Za-z]{3,9}\.?\s+)?(?:\d{1,2}[/-])?(?:19|20)\d{2}|present|current|now)/i);
  if (range) return { start: parseDate(range[1]), end: parseDate(range[2]), text: range[0] };
  const single = line.match(/\b(?:[A-Za-z]{3,9}\.?\s+)?(?:19|20)\d{2}\b/);
  return single ? { start: parseDate(single[0]), end: null, text: single[0] } : null;
}

function parseRoleLine(line: string): Role | null {
  if (/^[\u2022\-*\u00b7▪]/.test(line)) return null;
  if (line.length > 160) return null;
  const dates = parseDateRange(line);
  const stripped = dates ? line.replace(dates.text, '') : line;
  const parts = stripped.split(/\s*(?:\||\u2014|\u2013|\u2022)\s*/).map((p) => p.replace(/[(),]\s*$/, '').trim()).filter(Boolean);
  if (parts.length < 2) return null;
  if (!dates && parts.length < 3) return null;

  let [first, second] = parts;

  const TITLE_WORDS = /\b(engineer|developer|manager|designer|analyst|scientist|intern|lead|director|consultant|architect|administrator|specialist|president|founder|officer|assistant|associate|coordinator|technician|researcher)\b/i;
  if (!TITLE_WORDS.test(first) && TITLE_WORDS.test(second)) {
    const swap = first; first = second; second = swap;
  }
  const location = parts.slice(2).find((p) => RX.cityState.test(p)) || '';
  return {
    title: first,
    company: second,
    location,
    start: dates && dates.start ? dates.start : null,
    end: dates ? dates.end : null,
    current: !!(dates && dates.end && dates.end.present),
    raw: line
  };
}

function parseExperience(lines: string[] | undefined): Role[] {
  const roles: Role[] = [];
  for (const line of lines || []) {
    const role = parseRoleLine(line);
    if (role && role.start) roles.push(role);
  }
  return roles;
}

function parseEducation(lines: string[] | undefined): EducationEntry[] {
  const entries: EducationEntry[] = [];
  for (const line of lines || []) {
    if (/^[\u2022\-*\u00b7▪]/.test(line)) continue;
    const hasDegree = DEGREE_WORDS.test(line);
    const hasSchool = SCHOOL_WORDS.test(line);
    if (!hasDegree && !hasSchool) continue;
    const parts = line.split(/\s*(?:\||\u2014|\u2013(?!\s*\d)|\u00b7)\s*/).map((p) => p.trim()).filter(Boolean);
    const degree = parts.find((p) => DEGREE_WORDS.test(p)) || '';
    const school = parts.find((p) => SCHOOL_WORDS.test(p)) || '';
    const dates = parseDateRange(line);
    const gpaMatch = line.match(RX.gpa);
    const major = degree.match(/\bin\s+(.+)$/i);
    entries.push({
      degree: degree.replace(/\s+in\s+.+$/i, '').trim(),
      major: major ? major[1].trim() : '',
      school: school.replace(/,.*$/, '').trim(),
      graduation: dates ? (dates.end && !dates.end.present ? dates.end : dates.start) : null,
      gpa: gpaMatch ? gpaMatch[1] : '',
      raw: line
    });
  }
  return entries;
}

function parseSkills(lines: string[] | undefined): string[] {
  const skills = new Set<string>();
  for (const line of lines || []) {
    const body = line.replace(/^[\u2022\-*\u00b7▪]\s*/, '').replace(/^[^:]{0,40}:\s*/, '');
    for (const piece of body.split(/[,;|/]| and /i)) {
      const skill = piece.trim().replace(/\.$/, '');
      if (skill.length >= 2 && skill.length <= 32 && !/\s{2,}/.test(skill)) skills.add(skill);
    }
  }
  return [...skills];
}

function formatMonthYear(date: ParsedDate | null): string {
  if (!date || !date.year) return '';
  if (!date.month) return String(date.year);
  return String(date.month).padStart(2, '0') + '/' + date.year;
}

function yearsBetween(from: ParsedDate | null, to?: ParsedDate | null): number | null {
  if (!from || !from.year) return null;
  const start = from.year + ((from.month || 6) - 1) / 12;
  const end = to && to.year ? to.year + ((to.month || 6) - 1) / 12 : (new Date().getFullYear() + new Date().getMonth() / 12);
  return Math.max(0, end - start);
}

function totalYears(roles: Role[]): number | null {
  const now = new Date().getFullYear() + new Date().getMonth() / 12;
  const spans: Array<[number, number]> = [];

  for (const role of roles) {
    if (!role.start?.year) continue;
    const start = role.start.year + ((role.start.month || 1) - 1) / 12;
    const end = role.end?.year ? role.end.year + ((role.end.month || 12) - 1) / 12 : now;
    spans.push([start, Math.max(start, end)]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  if (!spans.length) return null;

  let total = 0;
  let [cursor, until] = spans[0]!;
  for (const [start, end] of spans.slice(1)) {
    if (start > until) { total += until - cursor; cursor = start; until = end; }
    else until = Math.max(until, end);
  }
  total += until - cursor;
  return Math.round(total * 10) / 10;
}

function extract(text: string): ExtractResult {
  const lines = toLines(text);
  const sections = splitSections(lines);
  const headerText = (sections.header || []).slice(0, 6).join(' | ');
  const all = lines.join('\n');
  const warnings: string[] = [];

  const email = firstMatch(headerText, RX.email) || firstMatch(all, RX.email);
  const phone = normalizePhone(firstMatch(headerText, RX.phone) || firstMatch(all, RX.phone));
  const linkedin = firstMatch(all, RX.linkedin);
  const github = firstMatch(all, RX.github);
  const twitter = firstMatch(all, RX.twitter);

  let website = '';
  for (const token of headerText.split(/[\s|]+/)) {
    if (!token || RX.email.test(token)) continue;
    if (/linkedin\.com|github\.com|twitter\.com|x\.com/i.test(token)) continue;
    const candidate = firstMatch(token, RX.url);
    if (candidate && /\.[a-z]{2,}$/i.test(candidate.replace(/\/.*$/, ''))) { website = candidate; break; }
  }

  const fullName = findName(lines, email);
  if (!fullName) warnings.push('Could not confidently read a name. Check the Profile tab.');
  const nameParts = splitName(fullName);

  const locationLine = (sections.header || []).find((line) => RX.cityState.test(line)) || '';
  const locationMatch = locationLine.match(RX.cityState);
  const city = locationMatch ? locationMatch[1] : '';
  const state = locationMatch ? locationMatch[2] : '';
  const postal = firstMatch(locationLine, RX.postal);

  const country = (state && isUSState(state)) || phone.startsWith('+1') || US_MENTION.test(headerText)
    ? 'United States'
    : '';

  const experience = parseExperience(sections.experience);
  const education = parseEducation(sections.education);
  const skills = parseSkills(sections.skills);
  const summary = (sections.summary || []).join(' ').trim();

  if (!experience.length && sections.experience) {
    warnings.push('Roles were found but not parsed cleanly. Review the current job title and employer.');
  }

  const current = experience.find((r) => r.current) || experience[0] || null;
  const newestEducation = education
    .slice()
    .sort((a, b) => ((b.graduation && b.graduation.year) || 0) - ((a.graduation && a.graduation.year) || 0))[0] || null;

  const years = totalYears(experience);

  const profile: Record<string, string> = {
    fullName,
    firstName: nameParts.firstName || '',
    middleName: nameParts.middleName || '',
    lastName: nameParts.lastName || '',
    email: email || '',
    phone: phone || '',
    city,
    state,
    postalCode: postal || '',
    country,
    location: city && state ? city + ', ' + state : (city || ''),
    linkedin: linkedin ? tidyUrl(linkedin) : '',
    github: github ? tidyUrl(github) : '',
    twitter: twitter ? tidyUrl(twitter) : '',
    website: website ? tidyUrl(website) : '',
    currentTitle: current ? current.title : '',
    currentEmployer: current ? current.company : '',
    yearsExperience: years != null ? String(years) : '',
    school: newestEducation ? newestEducation.school : '',
    degree: newestEducation ? newestEducation.degree : '',
    major: newestEducation ? newestEducation.major : '',
    graduationDate: newestEducation && newestEducation.graduation ? formatMonthYear(newestEducation.graduation) : '',
    gpa: newestEducation ? newestEducation.gpa : ''
  };

  for (const key of Object.keys(profile)) if (!profile[key]) delete profile[key];

  return { profile, experience, education, skills, summary, sections, warnings, lineCount: lines.length };
}

export {
  extract, toLines, splitSections, findName, splitName, normalizePhone,
  parseRoleLine, parseDateRange, parseEducation, parseSkills, totalYears, yearsBetween, RX
};
