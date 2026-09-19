import * as matcher from '../matching/matcher.ts';
import { normalize, squish } from '../matching/text.ts';
import { sameValue } from '../matching/verify.ts';
import type { Answer, AnswerType, ReviewItem, SerializedField } from '../../shared/types.ts';

export function answerTypeFor(field: SerializedField): AnswerType {
  switch (field.control) {
    case 'textarea':
    case 'contenteditable':
      return 'longtext';
    case 'select':
    case 'radio':
    case 'combobox':
      return 'choice';
    case 'checkbox':
      return field.options.length > 1 ? 'multichoice' : 'boolean';
    case 'file':
      return 'file';
    default:
      if (field.type === 'email') return 'email';
      if (field.type === 'tel') return 'phone';
      if (field.type === 'url') return 'url';
      if (field.type === 'number') return 'number';
      if (field.type === 'date') return 'date';
      return 'text';
  }
}

export interface FieldValue {
  field: SerializedField;
  value: string;
}

function worthKeeping(entry: FieldValue): boolean {
  const value = squish(entry.value);
  if (!value) return false;
  if (entry.field.control === 'file') return false;
  if (value.length > 4000) return false;

  return !/^(select|choose|please select)\b/i.test(value);
}

export function buildReviewItems(entries: FieldValue[], answers: Answer[], host = ''): ReviewItem[] {
  const items: ReviewItem[] = [];
  const claimed = new Set<string>();

  for (const entry of entries) {
    if (!worthKeeping(entry)) continue;

    const field = entry.field;
    const question = squish(field.label || field.placeholder || field.name);
    const value = squish(entry.value);
    if (!question) continue;

    const result = matcher.best(field, answers, { host });
    const match = result.status === 'none' ? undefined : result.match;
    const answer = match?.answer;

    const base = {
      uid: field.uid,
      question,
      value,
      kind: field.kind,
      control: field.control,
      type: answerTypeFor(field),
      choices: field.options.length ? field.options.map((option) => option.text).filter(Boolean) : undefined
    };

    if (!answer) {
      items.push({ ...base, action: 'new' });
      continue;
    }

    const known = [answer.question, ...answer.aliases].some((phrase) => normalize(phrase) === normalize(question));

    if (sameValue(answer.value, value, { answer })) {

      if (known) continue;
      items.push({ ...base, action: 'alias', answerId: answer.id, previous: answer.value });
      continue;
    }

    if (claimed.has(answer.id)) {
      items.push({ ...base, action: 'new' });
      continue;
    }
    claimed.add(answer.id);

    items.push({
      ...base,
      action: answer.value ? 'update' : 'new',
      answerId: answer.value ? answer.id : undefined,
      previous: answer.value
    });
  }

  const rank = { new: 0, update: 1, alias: 2 };
  return items.sort((a, b) => rank[a.action] - rank[b.action]);
}
