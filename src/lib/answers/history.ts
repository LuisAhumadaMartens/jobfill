import type { ScannedField, SerializedField, WorkEntry } from '../../shared/types.ts';

export const HISTORY_KINDS = ['employerName', 'jobTitle', 'currentEmployer', 'currentTitle'] as const;

type FieldLike = Partial<ScannedField & SerializedField>;

export function historyIndexOf(field: FieldLike): number {
  const identity = `${field.name ?? ''} ${field.id ?? ''}`;

  const bracket = /\[(\d{1,2})\]/.exec(identity);
  if (bracket) return Number(bracket[1]);

  const suffixed = /(?:experience|employment|work|job|position|employer|company)[^a-z0-9]{0,3}(\d{1,2})/i.exec(identity);
  if (suffixed) return Number(suffixed[1]);

  const labelled = /\b(?:employer|position|job|experience|company|role)\s*#?\s*(\d{1,2})\b/i.exec(field.label ?? '');
  if (labelled) return Math.max(0, Number(labelled[1]) - 1);

  return 0;
}

export function valueFromHistory(field: FieldLike, history: WorkEntry[]): string | null {
  const kind = field.kind;
  if (!kind || !history.length) return null;
  if (!HISTORY_KINDS.includes(kind as (typeof HISTORY_KINDS)[number])) return null;

  const index = historyIndexOf(field);
  const entry = history[index];
  if (!entry) return null;

  if (kind === 'employerName' || kind === 'currentEmployer') return entry.company || null;
  if (kind === 'jobTitle' || kind === 'currentTitle') return entry.title || null;
  return null;
}

export function toWorkEntries(roles: Array<{
  title: string;
  company: string;
  location: string;
  current: boolean;
  start: { year?: number; month?: number } | null;
  end: { year?: number; month?: number; present?: boolean } | null;
}>): WorkEntry[] {
  const asText = (date: { year?: number; month?: number } | null | undefined): string => {
    if (!date?.year) return '';
    return date.month ? `${String(date.month).padStart(2, '0')}/${date.year}` : String(date.year);
  };

  return roles
    .filter((role) => role.title || role.company)
    .map((role) => ({
      title: role.title,
      company: role.company,
      location: role.location,
      start: asText(role.start),
      end: role.current ? '' : asText(role.end),
      current: role.current
    }));
}
