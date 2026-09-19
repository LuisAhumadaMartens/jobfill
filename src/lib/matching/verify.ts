import { parsePlace, placeScore } from './places.ts';
import { areSynonyms } from './synonyms.ts';
import { asBoolean, normalize, squish } from './text.ts';
import { isSamePhone, parsePhone } from '../values/phone.ts';
import { isSameUrl, looksLikeUrl } from '../values/url.ts';
import type { Answer, AnswerType, ControlKind } from '../../shared/types.ts';

export type FillVerdict =

  | 'held'

  | 'cleared'

  | 'replaced'

  | 'unreadable';

const READABLE: ReadonlySet<ControlKind> = new Set(['input', 'textarea', 'select', 'radio', 'checkbox', 'contenteditable']);

export function sameValue(expected: string, current: string, options: { type?: AnswerType; answer?: Answer } = {}): boolean {
  const left = squish(expected);
  const right = squish(current);
  if (!left || !right) return false;
  if (normalize(left) === normalize(right)) return true;

  const type = options.type ?? options.answer?.type;

  if (type === 'phone' || (parsePhone(left) && parsePhone(right))) {
    if (isSamePhone(left, right)) return true;
  }

  if (type === 'url' || (looksLikeUrl(left) && looksLikeUrl(right))) {
    if (isSameUrl(left, right)) return true;
  }

  if (areSynonyms(left, right)) return true;

  const taught = options.answer?.valueAliases?.[left] ?? [];
  if (taught.some((alias) => normalize(alias) === normalize(right))) return true;

  if (parsePlace(left)?.region) return placeScore(left, right) >= 0.75;

  return false;
}

export function verifyValue(input: {
  control: ControlKind;

  expected: string;

  current: string;
  answer?: Answer;
}): FillVerdict {
  const current = squish(input.current);
  const expected = squish(input.expected);

  if (!expected) return 'held';

  if (input.control === 'checkbox') {
    const wanted = asBoolean(expected);
    if (wanted !== null) {
      if (wanted === !!current) return 'held';
      return current ? 'replaced' : 'cleared';
    }
  }

  if (!current) return READABLE.has(input.control) ? 'cleared' : 'unreadable';
  return sameValue(expected, current, { answer: input.answer }) ? 'held' : 'replaced';
}

export function verdictSummary(verdict: FillVerdict): string {
  return verdict === 'replaced' ? 'replaced by the page' : 'cleared by the page';
}

export function verdictNote(verdict: FillVerdict, current: string): string | undefined {
  if (verdict === 'replaced') return `The site changed this to “${squish(current)}”. Check it before submitting.`;
  if (verdict === 'cleared') return 'The site cleared this. Set it by hand.';
  return undefined;
}
