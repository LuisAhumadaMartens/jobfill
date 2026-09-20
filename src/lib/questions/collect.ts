import { atsFor } from '../sites.ts';
import { isCollectable, type QuestionControl, type QuestionOutcome, type Observation } from '../../shared/questions.ts';
import type { ControlKind, FieldPlan, Profile } from '../../shared/types.ts';

const OUTCOMES: Partial<Record<FieldPlan['status'], QuestionOutcome>> = {
  unknown: 'unmatched',
  suggest: 'unsure',
  failed: 'cleared'
};

const CONTROLS: Partial<Record<ControlKind, QuestionControl>> = {
  input: 'input',
  textarea: 'textarea',
  select: 'select',
  radio: 'radio',
  checkbox: 'checkbox',
  combobox: 'combobox',
  contenteditable: 'contenteditable'
};

const OWN_VALUE_FLOOR = 4;

export function ownValues(profile: Profile): string[] {
  return Object.values(profile)
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length >= OWN_VALUE_FLOOR);
}

function namesTheUser(text: string, own: string[]): boolean {
  const haystack = text.toLowerCase();
  return own.some((value) => haystack.includes(value));
}

export function observationFor(plan: FieldPlan, host: string, own: string[]): Observation | null {
  const ats = atsFor(host);
  if (!ats) return null;

  const outcome = OUTCOMES[plan.status];
  if (!outcome) return null;

  const control = CONTROLS[plan.field.control];
  if (!control) return null;

  const question = plan.field.label.trim();
  if (!isCollectable(question)) return null;
  if (namesTheUser(question, own)) return null;

  const options = plan.field.options
    .map((option) => option.text.trim())
    .filter((text) => text && !namesTheUser(text, own));

  if (plan.field.options.length !== options.length) return null;

  return {
    ats,
    control,
    question,
    options,
    outcome: outcome === 'cleared' && options.length && !plan.value ? 'no-option' : outcome,
    kind: plan.field.kind,
    confidence: typeof plan.score === 'number' ? plan.score : null
  };
}

export function observationsFor(plans: FieldPlan[], host: string, profile: Profile): Observation[] {
  const own = ownValues(profile);
  const seen = new Set<string>();
  const observations: Observation[] = [];

  for (const plan of plans) {
    const observation = observationFor(plan, host, own);
    if (!observation) continue;

    const key = `${observation.ats}|${observation.question.toLowerCase()}|${observation.outcome}`;
    if (seen.has(key)) continue;
    seen.add(key);
    observations.push(observation);
  }

  return observations;
}
