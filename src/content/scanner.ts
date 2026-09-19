import * as T from '../lib/matching/text.ts';
import * as matcher from '../lib/matching/matcher.ts';
import { isKnownATS } from '../lib/sites.ts';
import type { ControlKind, FieldOption, ScannedField, SerializedField } from '../shared/types.ts';

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'image', 'reset', 'password']);
const SKIP_NAME = /(^|[^a-z])(search|query|csrf|token|captcha|honeypot|_gotcha)([^a-z]|$)/i;

const APPLY_WORDS = /\b(apply|application|candidate|resume|cover letter|job|position|recruit)\b/i;

const usedIds = new Set<string>();

function hash(input: string): string {
  let value = 5381;
  for (let i = 0; i < input.length; i++) value = ((value << 5) + value + input.charCodeAt(i)) | 0;
  return Math.abs(value).toString(36);
}

function fieldId(el: Element, control: ControlKind, label: string): string {
  const input = el as HTMLInputElement;
  const formIndex = input.form ? [...document.forms].indexOf(input.form) : -1;
  const base = 'jf_' + hash([control, formIndex, input.name || '', el.id || '', label.slice(0, 80)].join('|'));

  let id = base;
  for (let suffix = 2; usedIds.has(id); suffix++) id = base + '_' + suffix;
  usedIds.add(id);
  return id;
}

function cssEscape(value: string): string {
  return (window.CSS && CSS.escape) ? CSS.escape(value) : value.replace(/["\\]/g, '\\$&');
}

function isVisible(el: Element | null): boolean {
  if (!el || !el.isConnected) return false;
  const input = el as HTMLInputElement;
  if (input.type && SKIP_TYPES.has(input.type)) return false;
  if (el.closest('[aria-hidden="true"]')) return false;

  const rects = el.getClientRects();
  if (rects.length === 0) {

    return input.type === 'file' && !!input.form;
  }
  const style = getComputedStyle(el);

  const opacity = Number.parseFloat(style.opacity);
  if (style.visibility === 'hidden' || style.display === 'none' || opacity === 0) {
    return input.type === 'file';
  }
  return true;
}

function isFillable(el: Element): boolean {
  const input = el as HTMLInputElement;
  if (input.disabled || input.readOnly) return false;
  if (input.type && SKIP_TYPES.has(input.type)) return false;
  if (SKIP_NAME.test(input.name || '') || SKIP_NAME.test(el.id || '')) return false;
  if (el.getAttribute('role') === 'searchbox') return false;
  return true;
}

function textOf(el: Element | null): string {
  if (!el) return '';
  const clone = el.cloneNode(true) as Element;
  for (const junk of clone.querySelectorAll('input, select, textarea, button, svg, script, style')) junk.remove();
  return T.squish(clone.textContent || '');
}

function tidyLabel(text: unknown): string {
  return T.squish(String(text || '')
    .replace(/[\u2217*]\s*$/, '')
    .replace(/\(\s*(required|optional)\s*\)\s*$/i, '')
    .replace(/\s*[:：]\s*$/, ''))
    .slice(0, 300);
}

function labelFromAriaLabelledBy(el: Element): string {
  const ids = (el.getAttribute('aria-labelledby') || '').split(/\s+/).filter(Boolean);
  if (!ids.length) return '';
  const root = el.getRootNode() as Document | ShadowRoot;
  return ids.map((id) => {
    const node = root.getElementById(id);
    return node ? textOf(node) : '';
  }).filter(Boolean).join(' ');
}

function labelFromFor(el: Element): string {
  if (!el.id) return '';
  const root = el.getRootNode() as Document | ShadowRoot;
  const node = root.querySelector('label[for="' + cssEscape(el.id) + '"]');
  return node ? textOf(node) : '';
}

function labelFromContainer(el: Element): string {
  let node = el.parentElement;
  for (let depth = 0; node && depth < 5; depth++, node = node.parentElement) {
    const inputs = node.querySelectorAll('input:not([type=hidden]), select, textarea');

    if (inputs.length > 1 && !allSameGroup(inputs)) break;

    const marker = node.querySelector('label, legend, [class*="label" i], [class*="question" i], [data-automation-id*="label" i]');
    if (marker && !marker.contains(el)) {
      const text = textOf(marker);
      if (text && text.length < 300) return text;
    }
    if (depth >= 1) {
      const own = textOf(node);
      if (own && own.length > 2 && own.length < 300) return own;
    }
  }
  return '';
}

function allSameGroup(inputs: ArrayLike<Element>): boolean {
  const names = new Set<string>();
  for (const el of Array.from(inputs)) {
    const input = el as HTMLInputElement;
    if (input.type !== 'radio' && input.type !== 'checkbox') return false;
    names.add(input.name || '');
  }
  return names.size <= 1;
}

function labelFromPrecedingText(el: Element): string {
  let node = el.previousElementSibling;
  for (let i = 0; node && i < 3; i++, node = node.previousElementSibling) {
    if (/^(input|select|textarea)$/i.test(node.tagName)) break;
    const text = textOf(node);
    if (text && text.length > 2 && text.length < 200) return text;
  }
  return '';
}

function labelFor(el: Element): string {
  const candidates = [
    labelFromAriaLabelledBy(el),
    labelFromFor(el),
    el.closest('label') ? textOf(el.closest('label')) : '',
    el.getAttribute('aria-label') || '',
    labelFromContainer(el),
    textOf(el.closest('fieldset')?.querySelector('legend') ?? null),
    labelFromPrecedingText(el),
    el.getAttribute('placeholder') || '',
    T.humanize(el.getAttribute('data-automation-id') || ''),
    T.humanize((el as HTMLInputElement).name || ''),
    T.humanize(el.id || '')
  ];
  for (const candidate of candidates) {
    const text = tidyLabel(candidate);
    if (text && text.length >= 2) return text;
  }
  return '';
}

function contextFor(el: Element): string {
  const section = el.closest('fieldset, section, [class*="section" i], form');
  if (!section) return '';
  const heading = section.querySelector('h1, h2, h3, h4, legend');
  return heading ? tidyLabel(textOf(heading)).slice(0, 120) : '';
}

function optionsOfSelect(el: HTMLSelectElement): FieldOption[] {
  return [...el.options].map((opt) => ({ value: opt.value, text: T.squish(opt.textContent), el: opt }));
}

function optionsOfGroup(inputs: HTMLInputElement[]): FieldOption[] {
  return inputs.map((input) => ({
    value: input.value,
    text: tidyLabel(labelFromFor(input) || (input.closest('label') ? textOf(input.closest('label')) : '') || input.getAttribute('aria-label') || input.value),
    el: input
  }));
}

function isCombobox(el: Element): boolean {
  if (el.getAttribute('role') === 'combobox') return true;
  if (el.getAttribute('aria-autocomplete') === 'list') return true;
  if (el.hasAttribute('aria-expanded') || el.getAttribute('aria-haspopup') === 'listbox') return true;
  if (el.closest('[role="combobox"]')) return true;
  if (el.closest('[class*="select__control"], [class*="Select-control"], [data-baseweb="select"], [class*="autocomplete" i]')) return true;

  const owned = el.getAttribute('aria-controls') || el.getAttribute('aria-owns');
  const target = owned ? document.getElementById(owned) : null;
  return target?.getAttribute('role') === 'listbox';
}

function comboboxSelection(el: Element): string {
  const control = el.parentElement?.closest('[class*="control" i], [class*="select" i], [class*="combobox" i]')
    ?? el.parentElement;
  if (!control) return '';

  const clone = control.cloneNode(true) as Element;
  for (const junk of clone.querySelectorAll(
    'input, textarea, label, button, svg, [class*="placeholder" i], [class*="label" i], [role="listbox"], [role="option"]'
  )) {
    junk.remove();
  }
  const text = T.squish(clone.textContent);

  return text.length <= 80 ? text : '';
}

function describe(el: Element, control: ControlKind, extra?: Partial<ScannedField>): ScannedField {
  const input = el as HTMLInputElement;
  const label = labelFor(el);
  const descriptor: ScannedField = Object.assign({
    uid: fieldId(el, control, label),
    el: el as HTMLElement,
    control,
    type: input.type || control,
    name: input.name || '',
    id: el.id || '',
    autocomplete: el.getAttribute('autocomplete') || '',
    placeholder: el.getAttribute('placeholder') || '',
    label,
    context: contextFor(el),
    required: input.required || el.getAttribute('aria-required') === 'true',
    options: [] as FieldOption[],
    inputs: undefined as HTMLInputElement[] | undefined,
    kind: null as string | null,
    currentValue: '',
    maxLength: input.maxLength > 0 ? input.maxLength : null
  }, extra || {});
  descriptor.kind = matcher.classify(descriptor);
  return descriptor;
}

function currentValueOf(descriptor: ScannedField): string {
  const el = descriptor.el;
  const inputs = descriptor.inputs ?? [];

  switch (descriptor.control) {
    case 'select': {
      const select = el as HTMLSelectElement;
      const chosen = select.options[select.selectedIndex];
      return select.value ? T.squish(chosen ? chosen.textContent : select.value) : '';
    }
    case 'radio': {
      const chosen = inputs.find((input) => input.checked);
      if (!chosen) return '';
      const option = descriptor.options.find((opt) => opt.el === chosen);
      return option ? option.text : chosen.value;
    }
    case 'checkbox': {
      if (inputs.length === 1) return inputs[0]!.checked ? 'Yes' : '';
      return descriptor.options
        .filter((opt) => (opt.el as HTMLInputElement | undefined)?.checked)
        .map((opt) => opt.text)
        .join(', ');
    }
    case 'file': {
      const files = (el as HTMLInputElement).files;
      return files && files.length ? files[0]!.name : '';
    }
    case 'combobox':
      return comboboxSelection(el) || T.squish((el as HTMLInputElement).value);
    case 'contenteditable':
      return T.squish(el.textContent);
    default:
      return (el as HTMLInputElement).value || '';
  }
}

function scan(scope?: ParentNode): ScannedField[] {
  usedIds.clear();
  const within = scope || document;
  const elements = [...within.querySelectorAll<HTMLElement>('input, select, textarea, [contenteditable="true"]')];
  const fields: ScannedField[] = [];
  const seenGroups = new Set<string>();

  for (const el of elements) {
    if (!isVisible(el) || !isFillable(el)) continue;

    const tag = el.tagName.toLowerCase();

    if (tag === 'select') {
      const descriptor = describe(el, 'select', { options: optionsOfSelect(el as HTMLSelectElement) });
      descriptor.currentValue = currentValueOf(descriptor);
      fields.push(descriptor);
      continue;
    }

    if (tag === 'textarea') {
      const descriptor = describe(el, 'textarea');
      descriptor.currentValue = (el as HTMLTextAreaElement).value || '';
      fields.push(descriptor);
      continue;
    }

    if (el.isContentEditable) {
      const descriptor = describe(el, 'contenteditable');
      descriptor.currentValue = T.squish(el.textContent || '');
      fields.push(descriptor);
      continue;
    }

    const input = el as HTMLInputElement;

    if (input.type === 'radio' || input.type === 'checkbox') {
      const scopeEl: ParentNode = input.form || within;
      const groupKey = input.type + '::' + (input.name || el.id || '') + '::' + (input.form?.name || '');
      if (input.name && seenGroups.has(groupKey)) continue;

      const siblings = input.name
        ? [...scopeEl.querySelectorAll<HTMLInputElement>('input[type="' + input.type + '"]')]
            .filter((other) => other.name === input.name && isVisible(other))
        : [input];
      if (input.name) seenGroups.add(groupKey);

      const options = optionsOfGroup(siblings);

      const anchor = siblings.length > 1 ? (el.closest('fieldset') || el.parentElement || el) : el;
      const descriptor = describe(el, input.type as ControlKind, { options, inputs: siblings });
      if (siblings.length > 1) {
        const groupLabel = tidyLabel(
          textOf(anchor.querySelector('legend'))
          || labelFromContainer(siblings[0]!)
          || descriptor.label
        );
        if (groupLabel) descriptor.label = groupLabel;
        descriptor.kind = matcher.classify(descriptor);
      }
      descriptor.currentValue = currentValueOf(descriptor);
      fields.push(descriptor);
      continue;
    }

    if (input.type === 'file') {
      const descriptor = describe(el, 'file');
      descriptor.currentValue = currentValueOf(descriptor);
      fields.push(descriptor);
      continue;
    }

    const control: ControlKind = isCombobox(el) ? 'combobox' : 'input';
    const descriptor = describe(el, control);
    descriptor.currentValue = input.value || '';
    fields.push(descriptor);
  }

  return fields.filter((field) => field.label || field.kind);
}

function looksLikeApplication(fields: ScannedField[]): boolean {
  if (isKnownATS(location.hostname)) return true;
  if (!fields || fields.length < 3) return false;

  const knownKinds = new Set(fields.map((f) => f.kind).filter(Boolean));
  const strong = ['resumeFile', 'coverLetter', 'workAuthorization', 'sponsorship', 'linkedin'];
  if (strong.some((k) => knownKinds.has(k))) return true;

  const hasIdentity = knownKinds.has('email') && (knownKinds.has('firstName') || knownKinds.has('fullName'));
  if (!hasIdentity) return false;

  const pageText = T.squish(document.title + ' ' + (document.body ? document.body.innerText.slice(0, 4000) : ''));
  return APPLY_WORDS.test(pageText);
}

function serialize(field: ScannedField): SerializedField {
  return {
    uid: field.uid,
    control: field.control,
    type: field.type,
    name: field.name,
    id: field.id,
    label: field.label,
    context: field.context,
    placeholder: field.placeholder,
    required: field.required,
    kind: field.kind,
    currentValue: field.currentValue,
    options: (field.options || []).map((opt) => ({ value: opt.value, text: opt.text }))
  };
}

export {
  scan, serialize, looksLikeApplication, labelFor, isVisible,
  currentValueOf as readValue, comboboxSelection
};
