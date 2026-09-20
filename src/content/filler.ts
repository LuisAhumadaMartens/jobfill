import * as T from '../lib/matching/text.ts';
import * as matcher from '../lib/matching/matcher.ts';
import { comboboxSelection } from './scanner.ts';
import { expandPlace, isPlace } from '../lib/matching/places.ts';
import { parsePhone, renderPhone } from '../lib/values/phone.ts';
import { shapeValue } from '../lib/values/shape.ts';
import type { Answer, ResumeRecord, ScannedField } from '../shared/types.ts';

export interface FillContext {

  countryField?: ScannedField;

  country?: string;
}

export interface FillOutcome {
  ok: boolean;

  applied?: string;
  reason?: string;
}

const SEARCH_BUDGET_MS = 3200;

const CHIP_BUDGET_MS = 6000;

const MAX_CHIPS = 12;

const HIGHLIGHT_CLASS = 'jobfill-touched';

function setNativeValue(el: HTMLElement, value: string): void {
  const prototype = el instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;

  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  if (descriptor?.set) descriptor.set.call(el, value);
  else (el as HTMLInputElement).value = value;
}

function announce(el: HTMLElement, events: string[] = ['input', 'change']): void {
  for (const name of events) {
    const event = name === 'input'
      ? new InputEvent('input', { bubbles: true, composed: true })
      : new Event(name, { bubbles: true, composed: true });
    el.dispatchEvent(event);
  }
}

function touch(el: HTMLElement): void {
  el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
}

function typeInto(el: HTMLElement, value: string): void {
  const input = el as HTMLInputElement;
  input.focus?.();
  setNativeValue(el, '');
  announce(el, ['input']);
  setNativeValue(el, value);
  announce(el, ['input', 'change']);
  touch(el);
}

function fillContentEditable(el: HTMLElement, value: string): void {
  el.focus();
  el.textContent = value;
  el.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
  touch(el);
}

function fillSelect(el: HTMLSelectElement, value: string, answer?: Answer): FillOutcome {
  const options = [...el.options].map((opt) => ({ value: opt.value, text: T.squish(opt.textContent), el: opt }));
  const chosen = matcher.matchOption(value, options, answer);
  if (!chosen) return { ok: false, reason: `No option matching "${value}"` };

  setNativeValue(el, chosen.value);

  if (el.value !== chosen.value && chosen.el) (chosen.el as HTMLOptionElement).selected = true;
  announce(el, ['input', 'change']);
  touch(el);
  return { ok: true, applied: chosen.text };
}

function pressOption(node: HTMLElement): void {
  node.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  node.click();
  if (node.getAttribute('aria-checked') === 'false') node.setAttribute('aria-checked', 'true');
}

function fillRadio(field: ScannedField, value: string, answer?: Answer): FillOutcome {
  const chosen = matcher.matchOption(value, field.options, answer);
  if (!chosen?.el) return { ok: false, reason: `No choice matching "${value}"` };

  if (!(chosen.el instanceof HTMLInputElement)) {
    pressOption(chosen.el);
    return { ok: true, applied: chosen.text };
  }

  const input = chosen.el as HTMLInputElement;
  if (!input.checked) {
    input.checked = true;
    input.click();

    if (!input.checked) input.checked = true;
    announce(input, ['input', 'change']);
  }
  return { ok: true, applied: chosen.text };
}

function fillCheckbox(field: ScannedField, value: string, answer?: Answer): FillOutcome {
  const inputs = field.inputs ?? [];

  if (!inputs.length && !field.options.length) {
    const wanted = T.asBoolean(value);
    if (wanted === null) return { ok: false, reason: `"${value}" is not a yes or no` };
    const checked = field.el.getAttribute('aria-checked') === 'true';
    if (checked !== wanted) {
      field.el.click();
      if ((field.el.getAttribute('aria-checked') === 'true') !== wanted) {
        field.el.setAttribute('aria-checked', String(wanted));
      }
    }
    return { ok: true, applied: wanted ? 'Yes' : 'No' };
  }

  if (inputs.length === 1) {
    const wanted = T.asBoolean(value);
    if (wanted === null) return { ok: false, reason: `"${value}" is not a yes or no` };
    const input = inputs[0]!;
    if (input.checked !== wanted) {
      input.click();
      if (input.checked !== wanted) {
        input.checked = wanted;
        announce(input, ['input', 'change']);
      }
    }
    return { ok: true, applied: wanted ? 'Yes' : 'No' };
  }

  const wanted = String(value).split(/\s*[,;]\s*/).filter(Boolean);
  const hits: string[] = [];
  for (const piece of wanted) {
    const chosen = matcher.matchOption(piece, field.options, answer);
    const input = chosen?.el as HTMLInputElement | undefined;
    if (!input) continue;
    if (!input.checked) input.click();
    hits.push(chosen!.text);
  }
  return hits.length ? { ok: true, applied: hits.join(', ') } : { ok: false, reason: `No boxes matched "${value}"` };
}

function isOnScreen(node: HTMLElement): boolean {
  return node.getClientRects().length > 0 && T.squish(node.textContent).length > 0;
}

function listboxOptions(el: HTMLElement): HTMLElement[] {
  const owned = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
  const target = owned ? document.getElementById(owned) : null;

  for (const scope of [target, document].filter(Boolean) as ParentNode[]) {
    const roled = [...scope.querySelectorAll<HTMLElement>('[role="option"]')].filter(isOnScreen);
    if (roled.length) return roled;
  }

  return [...document.querySelectorAll<HTMLElement>('[class*="option" i]:not([class*="options" i])')].filter(isOnScreen);
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mouse(node: HTMLElement, type: string): void {
  if (typeof PointerEvent === 'function' && (type === 'pointerdown' || type === 'pointerup')) {
    node.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true }));
    return;
  }
  node.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true }));
}

function openListbox(el: HTMLElement): void {
  el.focus();
  mouse(el, 'pointerdown');
  mouse(el, 'mousedown');
  mouse(el, 'mouseup');
  el.click();
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', keyCode: 40, bubbles: true }));
}

function selectionText(field: ScannedField): string {
  return comboboxSelection(field.el);
}

function searchQueries(value: string): string[] {

  if (isPlace(value)) return expandPlace(value);

  const words = value.replace(/[,;]/g, ' ').split(/\s+/).filter(Boolean);
  const candidates = [value, words.slice(0, 2).join(' '), words[0] ?? ''];
  const seen = new Set<string>();
  return candidates.filter((query) => {
    const key = T.normalize(query);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function pickFromList(
  el: HTMLElement,
  value: string,
  answer: Answer | undefined,
  budgetMs: number,
  baseline = ''
): Promise<{ picked: string | null; signature: string }> {
  const deadline = Date.now() + budgetMs;
  let lastSignature = baseline;
  let settled = 0;

  let changed = baseline === '';

  while (Date.now() < deadline) {
    await wait(70);
    const nodes = listboxOptions(el);
    const signature = nodes.map((node) => T.squish(node.textContent)).join('|');

    if (signature !== lastSignature) {
      lastSignature = signature;
      settled = 0;
      changed = true;
      continue;
    }
    settled++;
    if (!nodes.length) continue;

    const options = nodes.map((node) => {
      const text = T.squish(node.textContent);
      return { value: text, text, el: node };
    });
    const chosen = matcher.matchOption(value, options, answer);

    if (chosen?.el) {
      const option = chosen.el as HTMLElement;
      mouse(option, 'pointerdown');
      mouse(option, 'mousedown');
      mouse(option, 'mouseup');
      option.click();
      return { picked: chosen.text, signature };
    }

    if (settled >= 2 && changed) return { picked: null, signature };
  }
  return { picked: null, signature: lastSignature };
}

async function fillChips(field: ScannedField, values: string[], answer?: Answer): Promise<FillOutcome> {
  const accepted: string[] = [];
  const deadline = Date.now() + CHIP_BUDGET_MS;
  let misses = 0;
  let attempted = 0;

  for (const value of values.slice(0, MAX_CHIPS)) {
    if (Date.now() > deadline || misses >= 2) break;
    attempted++;

    const outcome = await fillCombobox(field, value, answer);
    if (outcome.ok && outcome.applied) {
      accepted.push(outcome.applied);
      misses = 0;
    } else {
      misses++;
    }
    await wait(80);
  }

  if (!accepted.length) {
    return { ok: false, reason: 'This box did not offer any of those, so none were added' };
  }

  return {
    ok: true,
    applied: accepted.join(', '),
    reason: accepted.length < values.length
      ? `Added ${accepted.length} of ${values.length}; add the rest by hand`
      : undefined
  };
}

async function fillCombobox(field: ScannedField, value: string, answer?: Answer): Promise<FillOutcome> {
  const el = field.el as HTMLInputElement;
  const wanted = (text: string): boolean => {
    const current = T.normalize(text);
    return !!current && (current === T.normalize(value) || !!matcher.matchOption(value, [{ value: text, text }], answer));
  };

  openListbox(el);

  const opened = await pickFromList(el, value, answer, 700);
  let picked = opened.picked;
  const seen = new Set([opened.signature]);

  if (!picked) {

    const deadline = Date.now() + SEARCH_BUDGET_MS;
    let baseline = opened.signature;

    for (const query of searchQueries(value)) {
      const remaining = deadline - Date.now();
      if (remaining < 400) break;

      typeInto(el, query);
      const attempt = await pickFromList(el, value, answer, Math.min(1300, remaining), baseline);
      picked = attempt.picked;
      if (picked) break;

      if (seen.has(attempt.signature) && attempt.signature !== '') break;
      seen.add(attempt.signature);
      baseline = attempt.signature;
    }
  }

  await wait(140);

  const shown = selectionText(field);

  if (picked) {
    const committed = (shown && T.normalize(shown).includes(T.normalize(picked)))
      || wanted(shown || T.squish(el.value) || picked);
    if (committed) return { ok: true, applied: picked };
  }

  if (wanted(shown)) return { ok: true, applied: shown };

  if (el.value) {
    typeInto(el, '');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
  }
  return { ok: false, reason: `This dropdown has no option matching "${value}". Choose it by hand.` };
}

export async function attachFile(field: ScannedField, resume: ResumeRecord): Promise<FillOutcome> {
  const input = field.el as HTMLInputElement;
  if (!resume?.dataUrl) return { ok: false, reason: 'No resume file saved' };
  if (input.files?.length) return { ok: false, reason: 'A file is already attached' };

  try {
    const blob = await (await fetch(resume.dataUrl)).blob();
    const file = new File([blob], resume.name, { type: resume.type || blob.type });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    announce(input, ['input', 'change']);
    return { ok: true, applied: resume.name };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'Could not attach the file' };
  }
}

export function restoreValue(field: ScannedField, previous: string): void {
  const inputs = field.inputs ?? [];

  if (field.control === 'checkbox' || field.control === 'radio') {
    const wanted = T.normalize(previous);
    for (const input of inputs) {
      const option = field.options.find((candidate) => candidate.el === input);
      const should = !!wanted && T.normalize(option?.text ?? '') === wanted;
      if (input.checked !== should) input.click();
    }
    for (const option of field.options) {
      const node = option.el;
      if (!node || node instanceof HTMLInputElement) continue;
      const should = !!wanted && T.normalize(option.text) === wanted;
      if ((node.getAttribute('aria-checked') === 'true') !== should) node.click();
    }
    flash(field.el, true);
    return;
  }

  if (field.control === 'contenteditable') {
    fillContentEditable(field.el, previous);
    flash(field.el, true);
    return;
  }

  if (field.control === 'select') {
    setNativeValue(field.el, previous);
    announce(field.el, ['input', 'change']);
    flash(field.el, true);
    return;
  }

  typeInto(field.el, previous);
  flash(field.el, true);
}

export function flash(el: HTMLElement, ok = true): void {
  el.classList.add(HIGHLIGHT_CLASS);
  el.setAttribute('data-jobfill', ok ? 'filled' : 'failed');
  setTimeout(() => el.classList.remove(HIGHLIGHT_CLASS), 1400);
}

export function scrollTo(field: ScannedField): void {
  field.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  flash(field.el);
  (field.el as HTMLInputElement).focus?.({ preventScroll: true });
}

async function fillPhone(field: ScannedField, value: string, context: FillContext): Promise<FillOutcome> {
  const countryField = context.countryField;

  if (countryField) {
    const phone = parsePhone(value);
    const wanted = [context.country, phone ? `+${phone.country}` : '']
      .filter((candidate): candidate is string => !!candidate);

    for (const candidate of wanted) {
      const outcome = countryField.control === 'combobox'
        ? await fillCombobox(countryField, candidate)
        : fillSelect(countryField.el as HTMLSelectElement, candidate);
      if (outcome.ok) break;
    }
  }

  const text = renderPhone(value, {
    placeholder: field.placeholder,
    pattern: field.pattern,
    maxLength: field.maxLength,
    hasCountryControl: !!countryField
  });

  typeInto(field.el, text);
  return { ok: true, applied: text };
}

export async function fillField(
  field: ScannedField,
  value: string,
  answer?: Answer,
  context: FillContext = {}
): Promise<FillOutcome> {
  if (value == null || value === '') return { ok: false, reason: 'No value saved yet' };

  const isPhone = answer?.type === 'phone' || field.kind === 'phone' || field.type === 'tel';
  if (isPhone && field.control === 'input' && parsePhone(value)) {
    const outcome = await fillPhone(field, value, context);
    flash(field.el, outcome.ok);
    return outcome;
  }

  let outcome: FillOutcome;
  switch (field.control) {
    case 'select':
      outcome = fillSelect(field.el as HTMLSelectElement, value, answer);
      break;
    case 'radio':
      outcome = fillRadio(field, value, answer);
      break;
    case 'checkbox':
      outcome = fillCheckbox(field, value, answer);
      break;
    case 'combobox': {
      const multiple = answer?.type === 'multichoice' || field.kind === 'skills';
      const parts = value.split(/\s*,\s*/).filter(Boolean);
      outcome = multiple && parts.length > 1
        ? await fillChips(field, parts, answer)
        : await fillCombobox(field, value, answer);
      break;
    }
    case 'contenteditable':
      fillContentEditable(field.el, value);
      outcome = { ok: true, applied: value };
      break;
    case 'file':
      outcome = { ok: false, reason: 'Use attachFile for file inputs' };
      break;
    default: {
      const element = field.el as HTMLInputElement;
      const shaped = shapeValue(value, {
        type: field.type,
        maxLength: field.maxLength,
        placeholder: field.placeholder,
        min: element.getAttribute?.('min'),
        max: element.getAttribute?.('max'),
        step: element.getAttribute?.('step')
      });
      const trimmed = field.maxLength && shaped.length > field.maxLength ? shaped.slice(0, field.maxLength) : shaped;
      typeInto(field.el, trimmed);
      outcome = { ok: true, applied: trimmed };
      if (trimmed !== shaped) outcome.reason = `Trimmed to the field's ${field.maxLength} character limit`;
    }
  }

  flash(field.el, outcome.ok);
  return outcome;
}

export function injectHighlightStyles(): void {
  if (document.getElementById('jobfill-highlight-styles')) return;
  const style = document.createElement('style');
  style.id = 'jobfill-highlight-styles';
  style.textContent = `
    .${HIGHLIGHT_CLASS} {
      outline: 2px solid #6366f1 !important;
      outline-offset: 1px !important;
      border-radius: 3px;
      transition: outline-color .4s ease;
    }
    .${HIGHLIGHT_CLASS}[data-jobfill="failed"] { outline-color: #f59e0b !important; }
  `;
  (document.head ?? document.documentElement).appendChild(style);
}
