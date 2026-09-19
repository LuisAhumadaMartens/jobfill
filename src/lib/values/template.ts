import { squish } from '../matching/text.ts';

export interface PageContext {
  company?: string;
  role?: string;
  host?: string;
}

const TITLE_PATTERNS = [
  /^job application for (.+?) at (.+?)$/i,
  /^(.+?) @ (.+?)$/,
  /^(.+?) - (.+?) - careers$/i,
  /^apply (?:now )?(?:for|to) (.+?) (?:at|@) (.+?)$/i
];

export function pageContextFrom(title: string, host = ''): PageContext {
  const clean = squish(title).replace(/\s*[|]\s*.*$/, '');

  for (const pattern of TITLE_PATTERNS) {
    const match = pattern.exec(clean);
    if (match) return { role: squish(match[1]), company: squish(match[2]), host };
  }

  const atCompany = /(.+?)\s+at\s+(.+)/i.exec(clean);
  if (atCompany) return { role: squish(atCompany[1]), company: squish(atCompany[2]), host };

  return { host };
}

export function hasPlaceholders(value: string): boolean {
  return /\{\s*(company|role|position|title|host)\s*\}/i.test(value);
}

export function fillTemplate(value: string, context: PageContext): string {
  if (!hasPlaceholders(value)) return value;

  return value.replace(/\{\s*(company|role|position|title|host)\s*\}/gi, (whole, key: string) => {
    const name = key.toLowerCase();
    if (name === 'company') return context.company ?? whole;
    if (name === 'host') return context.host ?? whole;
    return context.role ?? whole;
  });
}
