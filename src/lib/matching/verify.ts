import { parsePlace, placeScore } from './places.ts';
import { areSynonyms } from './synonyms.ts';
import { asBoolean, normalize, squish } from './text.ts';
import type { Answer, ControlKind } from '../../shared/types.ts';

export type FillVerdict =

  | 'held'

  | 'cleared'

  | 'replaced'

  | 'unreadable';

const READABLE: ReadonlySet<ControlKind> = new Set(['input', 'textarea', 'select', 'radio', 'checkbox', 'contenteditable']);

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
  if (normalize(current) === normalize(expected)) return 'held';
  if (areSynonyms(expected, current)) return 'held';

  const taught = input.answer?.valueAliases?.[expected] ?? [];
  if (taught.some((alias) => normalize(alias) === normalize(current))) return 'held';

  if (parsePlace(expected)?.region) return placeScore(expected, current) >= 0.75 ? 'held' : 'replaced';

  return 'replaced';
}

export function verdictSummary(verdict: FillVerdict): string {
  return verdict === 'replaced' ? 'replaced by the page' : 'cleared by the page';
}

export function verdictNote(verdict: FillVerdict, current: string): string | undefined {
  if (verdict === 'replaced') return `The site changed this to “${squish(current)}”. Check it before submitting.`;
  if (verdict === 'cleared') return 'The site cleared this. Set it by hand.';
  return undefined;
}
