const ABBREVIATIONS: Record<string, string> = {
  'u s': 'united states',
  'us': 'united states',
  'usa': 'united states',
  'uk': 'united kingdom',
  'yr': 'year',
  'yrs': 'year',
  'years': 'year',
  'exp': 'experience',

  'num': 'number',
  'tel': 'phone',
  'telephone': 'phone',
  'mobile': 'phone',
  'cell': 'phone',
  'e mail': 'email',
  'mail': 'email',
  'addr': 'address',
  'st': 'street',
  'apt': 'apartment',
  'zip': 'postal',
  'zipcode': 'postal',
  'postcode': 'postal',
  'dob': 'date of birth',
  'cv': 'resume',
  'curriculum vitae': 'resume',
  'github': 'github',
  'linked in': 'linkedin',
  'url': 'link',
  'website': 'link',
  'site': 'link',
  'comp': 'compensation',
  'salary': 'compensation',
  'pay': 'compensation',
  'org': 'organization',
  'company': 'employer',
  'uni': 'university',
  'college': 'university',
  'school': 'university',
  'grad': 'graduation',
  'eeo': 'equal employment opportunity'
};

const STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'am', 'be', 'been', 'do', 'does', 'did', 'you',
  'your', 'yours', 'we', 'our', 'us', 'i', 'my', 'me', 'please', 'kindly', 'to',
  'of', 'for', 'in', 'on', 'at', 'by', 'with', 'from', 'as', 'and', 'or', 'if',
  'it', 'this', 'that', 'these', 'those', 'there', 'here', 'will', 'would',
  'can', 'could', 'may', 'might', 'shall', 'should', 'have', 'has', 'had',
  'any', 'all', 'what', 'which', 'who', 'whom', 'how', 'when', 'where', 'why',
  'enter', 'provide', 'select', 'choose', 'type', 'fill', 'tell', 'let', 'know',
  'field', 'question', 'answer', 'optional', 'required', 'applicant', 'candidate'
]);

const CONTAINMENT_FLOOR = 0.34;

const TOKEN_SUBSET_FLOOR = 0.5;

const PHRASE_KEYS = Object.keys(ABBREVIATIONS)
  .filter((k) => k.includes(' '))
  .sort((a, b) => b.length - a.length);

const SMART_CHARS = /[‘’‚‛′‵]/g;
const SMART_QUOTES = /[“”„‟″‶]/g;
const DASHES = /[‐-―−]/g;

function clean(input: unknown): string {
  return String(input == null ? '' : input)
    .replace(SMART_CHARS, "'")
    .replace(SMART_QUOTES, '"')
    .replace(DASHES, '-')
    .replace(/ |​|‌|‍|﻿/g, ' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function normalize(input: unknown): string {
  let s = clean(input);

  s = s
    .replace(/\(\s*(required|optional|mandatory|if applicable)\s*\)/g, ' ')
    .replace(/\b(required|optional|mandatory)\s*(field)?\b/g, ' ')
    .replace(/[*∗٭]/g, ' ')
    .replace(/\bplease\b/g, ' ');

  s = s.replace(/['\u2019]/g, '');
  s = s.replace(/[^a-z0-9+#/ ]+/g, ' ').replace(/\s+/g, ' ').trim();

  let padded = ' ' + s + ' ';
  for (const phrase of PHRASE_KEYS) {
    if (padded.includes(' ' + phrase + ' ')) {
      padded = padded.split(' ' + phrase + ' ').join(' ' + ABBREVIATIONS[phrase] + ' ');
    }
  }
  s = padded.trim();

  const words = s.split(' ').filter(Boolean).map((w) => ABBREVIATIONS[w] || w);
  return words.join(' ').replace(/\s+/g, ' ').trim();
}

function tokens(input: string): string[] {
  const norm = typeof input === 'string' ? normalize(input) : '';
  const out: string[] = [];
  for (const word of norm.split(' ')) {
    if (!word) continue;
    if (STOPWORDS.has(word)) continue;
    if (word.length < 2 && !/[0-9]/.test(word)) continue;
    out.push(word);
  }

  return out.length ? out : norm.split(' ').filter(Boolean);
}

function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const pairs = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    pairs.set(bg, (pairs.get(bg) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const count = pairs.get(bg) ?? 0;
    if (count > 0) {
      pairs.set(bg, count - 1);
      hits++;
    }
  }
  return (2 * hits) / (a.length + b.length - 2);
}

function tokenOverlap(aTokens: string[], bTokens: string[]): number {
  if (!aTokens.length || !bTokens.length) return 0;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const ta = tokens(na);
  const tb = tokens(nb);
  const dice = diceCoefficient(na, nb);
  const overlap = tokenOverlap(ta, tb);
  let score = 0.45 * dice + 0.55 * overlap;

  const shorter = na.length <= nb.length ? na : nb;
  const longer = shorter === na ? nb : na;
  const coverage = shorter.length / longer.length;

  const contained = (' ' + longer + ' ').includes(' ' + shorter + ' ');
  if (contained && shorter.length >= 4 && coverage >= CONTAINMENT_FLOOR) {
    score = Math.max(score, 0.74 + 0.22 * coverage);
  }

  if (ta.length && tb.length) {
    const small = ta.length <= tb.length ? ta : tb;
    const large = small === ta ? tb : ta;
    if (small.length >= 2 && small.length / large.length >= TOKEN_SUBSET_FLOOR) {
      const words = new Set(large);
      if (small.every((word) => words.has(word))) score = Math.max(score, 0.8);
    }
  }

  return Math.min(1, score);
}

function humanize(identifier: string): string {
  return String(identifier || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.[\]]+/g, ' ')
    .replace(/\d+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function squish(input: unknown): string {
  return String(input == null ? '' : input)
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const YES = new Set(['yes', 'y', 'true', '1', 'agree', 'i agree', 'accept', 'confirmed', 'si', 'sí']);
const NO = new Set(['no', 'n', 'false', '0', 'disagree', 'decline', 'none']);

function asBoolean(value: unknown): boolean | null {
  const v = clean(value).trim();
  if (YES.has(v)) return true;
  if (NO.has(v)) return false;
  return null;
}

export {
  clean, normalize, tokens, similarity, diceCoefficient, tokenOverlap,
  humanize, squish, asBoolean, STOPWORDS, ABBREVIATIONS
};
