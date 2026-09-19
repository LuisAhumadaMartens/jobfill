import * as T from './text.ts';
import * as S from '../answers/schema.ts';
import { areRelated, areSynonyms } from './synonyms.ts';
import { bestPlace, looksLikeLocationList, parsePlace } from './places.ts';
import type { Answer, BestMatch, RankedAnswer, ScannedField, SerializedField, FieldOption } from '../../shared/types.ts';

type FieldLike = Partial<ScannedField & SerializedField>;

const SCORE = {

  exactQuestion: 0.99,
  exactAlias: 0.98,

  kind: 0.97,

  fuzzyCeiling: 0.93,
  siteBonus: 0.04,
  usageBonus: 0.02
};

function squash(value: unknown): string {
  return T.clean(value).replace(/[^a-z0-9]/g, '');
}

function classify(field: FieldLike | null | undefined): string | null {
  if (!field) return null;

  const auto = T.clean(field.autocomplete || '').trim();
  if (auto && auto !== 'off' && auto !== 'on') {
    for (const kind of S.KINDS) {
      if (kind.auto && kind.auto.some((token) => auto === token || auto.endsWith(' ' + token))) return kind.key;
    }
  }

  const label = T.normalize(field.label || '');
  const secondary = T.normalize([field.placeholder, field.context].filter(Boolean).join(' '));
  const ident = squash([field.name, field.id].filter(Boolean).join(' '));

  const tryPatterns = (text: string): string | null => {
    if (!text) return null;
    for (const kind of S.KINDS) {
      if (kind.exclude && kind.exclude.some((rx) => rx.test(text))) continue;
      if (kind.patterns.some((rx) => rx.test(text))) return kind.key;
    }
    return null;
  };

  const fromLabel = tryPatterns(label);
  if (fromLabel) return fromLabel;

  if (ident) {
    for (const kind of S.KINDS) {
      if (!kind.nameHints) continue;
      if (kind.exclude && kind.exclude.some((rx) => rx.test(T.humanize(field.name || field.id || '').toLowerCase()))) continue;
      if (kind.nameHints.some((hint) => ident.includes(squash(hint)))) return kind.key;
    }
  }

  return tryPatterns(secondary);
}

function phrasesOf(answer: Answer): string[] {
  const out = [answer.question];
  if (Array.isArray(answer.aliases)) out.push(...answer.aliases);
  return out.filter((p) => typeof p === 'string' && p.trim());
}

const CHOICE_CONTROLS = new Set(['select', 'radio', 'checkbox', 'combobox']);

const NEVER_A_CHOICE = new Set(['phone', 'email', 'url', 'longtext']);

function typePenalty(answer: Answer, field: FieldLike | null | undefined): number {
  if (!field) return 0;

  if (answer.type === 'longtext' && field.control === 'input' && field.type !== 'search') return 0.12;
  if (answer.type === 'file' && field.control !== 'file') return 0.5;
  if (answer.type !== 'file' && field.control === 'file') return 0.5;

  if (field.control && CHOICE_CONTROLS.has(field.control)) {

    if (NEVER_A_CHOICE.has(answer.type)) return 0.6;

    const options = field.options ?? [];
    if (options.length && answer.value && !matchOption(answer.value, options, answer)) return 0.45;
  }

  return 0;
}

function rank(field: FieldLike | null | undefined, answers: Answer[], options?: { host?: string }): RankedAnswer[] {
  const opts = options || {};
  const host = opts.host || '';
  const label = field && field.label ? field.label : '';
  const normLabel = T.normalize(label);
  const kind = field && field.kind ? field.kind : classify(field);
  const results: RankedAnswer[] = [];

  for (const answer of answers || []) {
    if (answer.archived) continue;
    if (answer.scope && answer.scope.startsWith('site:')) {
      const scopeHost = answer.scope.slice(5);
      if (!host || !(host === scopeHost || host.endsWith('.' + scopeHost))) continue;
    }

    let score = 0;
    let reason: RankedAnswer['reason'] = 'fuzzy';
    const consider = (value: number, why: RankedAnswer['reason']): void => {
      if (value > score) { score = value; reason = why; }
    };

    if (kind && answer.kind === kind && S.kindFitsType(answer.kind, answer.type)) consider(SCORE.kind, 'kind');

    if (normLabel) {
      for (const phrase of phrasesOf(answer)) {
        const normPhrase = T.normalize(phrase);
        if (!normPhrase) continue;
        if (normPhrase === normLabel) {
          const isQuestion = phrase === answer.question;
          consider(isQuestion ? SCORE.exactQuestion : SCORE.exactAlias, isQuestion ? 'exact' : 'alias');
          continue;
        }
        consider(Math.min(T.similarity(normPhrase, normLabel), SCORE.fuzzyCeiling), 'fuzzy');
      }
    }

    if (score <= 0) continue;

    if (answer.scope && answer.scope.startsWith('site:')) score += SCORE.siteBonus;
    if (answer.usageCount > 0) score += Math.min(SCORE.usageBonus, answer.usageCount * 0.004);
    score -= typePenalty(answer, field);

    results.push({ answer, score: Math.max(0, Math.min(1, score)), reason });
  }

  results.sort((a, b) => b.score - a.score || (b.answer.usageCount || 0) - (a.answer.usageCount || 0));
  return results;
}

function best(field: FieldLike, answers: Answer[], options?: { host?: string; fillConfidence?: number; suggestConfidence?: number }): BestMatch {
  const opts = options || {};
  const fillAt = opts.fillConfidence != null ? opts.fillConfidence : 0.62;
  const suggestAt = opts.suggestConfidence != null ? opts.suggestConfidence : 0.42;
  const ranked = rank(field, answers, opts);
  const top = ranked[0];
  if (!top) return { status: 'none', candidates: [] };
  const status = top.score >= fillAt ? 'fill' : top.score >= suggestAt ? 'suggest' : 'none';
  return { status, match: top, candidates: ranked.slice(0, 6) };
}

function search(query: string, answers: Answer[], limit?: number): Answer[] {
  const q = T.normalize(query);
  if (!q) return (answers || []).slice(0, limit || 50);
  const scored: Array<{ answer: Answer; score: number }> = [];
  for (const answer of answers || []) {
    let score = 0;
    for (const phrase of phrasesOf(answer)) score = Math.max(score, T.similarity(phrase, q));
    const inValue = T.normalize(answer.value || '').includes(q) ? 0.5 : 0;
    score = Math.max(score, inValue);
    if (T.normalize(answer.question).includes(q)) score = Math.max(score, 0.85);
    if (score > 0.25) scored.push({ answer, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit || 50).map((s) => s.answer);
}

const OPTION_FUZZY_FLOOR = 0.72;

const DECLINE_WORDS = [
  'decline', 'prefer not', 'rather not', 'do not wish', 'dont wish',
  'wish to answer', 'not to answer', 'not disclose', 'self identify'
];

function matchOption(value: unknown, options: FieldOption[], answer?: Answer | null): FieldOption | null {
  if (!options || !options.length) return null;
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;

  const usable = options.filter((opt) => {
    const text = T.normalize(opt.text || opt.value || '');
    if (!text) return false;

    return !/^(select|choose|pick|please select|none|--)\b/.test(text);
  });
  const pool = usable.length ? usable : options;
  const target = T.normalize(raw);

  const exact = pool.find((opt) => T.normalize(opt.text) === target || T.normalize(opt.value) === target);
  if (exact) return exact;

  const context = { longList: pool.length >= 10 };
  const synonym = pool.find((opt) => areSynonyms(raw, opt.text, context) || areSynonyms(raw, opt.value, context));
  if (synonym) return synonym;

  if (DECLINE_WORDS.some((w) => target.includes(T.normalize(w)))) {
    const declined = pool.find((opt) => DECLINE_WORDS.some((w) => T.normalize(opt.text).includes(T.normalize(w))));
    if (declined) return declined;
  }

  const bool = T.asBoolean(raw);
  if (bool !== null) {
    const wanted = bool ? /^(yes|y|true|i (do|am|have)|agree|accept)\b/ : /^(no|n|false|i (do not|am not|have not|don't)|decline)\b/;
    const hit = pool.find((opt) => wanted.test(T.normalize(opt.text)));
    if (hit) return hit;
  }

  const valueAliases = answer && answer.valueAliases && answer.valueAliases[raw];
  if (Array.isArray(valueAliases)) {
    for (const alias of valueAliases) {
      const hit = pool.find((opt) => T.normalize(opt.text) === T.normalize(alias));
      if (hit) return hit;
    }
  }

  const related = pool.find((opt) => areRelated(raw, opt.text, context) || areRelated(raw, opt.value, context));
  if (related) return related;

  if (parsePlace(raw) && looksLikeLocationList(pool.map((opt) => ({ text: opt.text, value: opt.value })))) {
    return bestPlace(raw, pool.map((opt) => ({ ...opt, text: opt.text, value: opt.value })));
  }

  let bestOpt: FieldOption | null = null;
  let bestScore = 0;
  for (const opt of pool) {
    const score = Math.max(T.similarity(opt.text, raw), T.similarity(opt.value, raw));
    if (score > bestScore) { bestScore = score; bestOpt = opt; }
  }

  return bestScore >= OPTION_FUZZY_FLOOR ? bestOpt : null;
}

export {
  classify, rank, best, search, matchOption, phrasesOf, SCORE
};
