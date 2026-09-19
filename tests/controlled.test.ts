import { beforeEach, expect, test } from 'bun:test';
import { readValue, scan } from '../src/content/scanner.ts';
import { fillField } from '../src/content/filler.ts';
import type { ScannedField } from '../src/shared/types.ts';

function render(html: string): ScannedField[] {
  document.documentElement.innerHTML = html;
  return scan(document);
}

function reactControlled(el: HTMLSelectElement) {
  const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!;
  let tracked = String(proto.get!.call(el));
  let state = '';

  Object.defineProperty(el, 'value', {
    configurable: true,
    get(): string { return proto.get!.call(this) as string; },
    set(next: string) {
      tracked = String(next);
      proto.set!.call(this, next);
    }
  });

  el.addEventListener('change', () => {
    const current = String(proto.get!.call(el));
    if (current === tracked) return;
    tracked = current;
    state = current;
  });

  return {

    rerender(): void { proto.set!.call(el, state); },
    get state(): string { return state; }
  };
}

beforeEach(() => {
  document.documentElement.innerHTML = '';
});

test('a framework-controlled select keeps its value when the page re-renders', async () => {
  const [field] = render(`
    <label for="s">Are you legally authorized to work in the United States?</label>
    <select id="s" name="auth">
      <option value="">Please select</option>
      <option>Yes</option>
      <option>No</option>
    </select>`);

  const app = reactControlled(field!.el as HTMLSelectElement);
  const outcome = await fillField(field!, 'Yes');
  expect(outcome.ok).toBe(true);

  expect(app.state).toBe('Yes');

  app.rerender();
  expect((field!.el as HTMLSelectElement).value).toBe('Yes');
});

test('a combobox is only filled once an option is committed', async () => {
  const fields = render(`
    <div class="field">
      <div id="l">Country</div>
      <div class="select__control">
        <span class="select__placeholder">Select…</span>
        <input role="combobox" aria-labelledby="l" aria-controls="lb" aria-autocomplete="list">
      </div>
    </div>
    <div id="lb" role="listbox" hidden>
      <div role="option">Canada</div>
      <div role="option">United States of America</div>
    </div>`);

  const field = fields.find((f) => f.control === 'combobox')!;
  const input = field.el as HTMLInputElement;
  const control = document.querySelector('.select__control')!;
  const listbox = document.getElementById('lb')!;

  const open = () => { listbox.hidden = false; };
  input.addEventListener('keydown', open);
  input.addEventListener('input', open);
  listbox.addEventListener('mousedown', (event) => {
    const option = (event.target as HTMLElement).closest('[role="option"]');
    if (!option) return;
    control.querySelector('.select__placeholder')?.remove();
    const chosen = document.createElement('span');
    chosen.className = 'select__value';
    chosen.textContent = option.textContent;
    control.prepend(chosen);
    input.value = '';
    listbox.hidden = true;
  });

  const outcome = await fillField(field, 'United States');

  expect(outcome.ok).toBe(true);
  expect(outcome.applied).toBe('United States of America');
  expect(document.querySelector('.select__value')?.textContent).toBe('United States of America');
  expect(input.value).toBe('');
});

test('a combobox that commits nothing fails, and does not leave text behind', async () => {
  const fields = render(`
    <div id="l">Country</div>
    <div class="select__control">
      <input role="combobox" aria-labelledby="l" aria-controls="lb">
    </div>
    <div id="lb" role="listbox" hidden><div role="option">Canada</div></div>`);

  const field = fields.find((f) => f.control === 'combobox')!;
  const outcome = await fillField(field, 'United States');

  expect(outcome.ok).toBe(false);
  expect(outcome.reason).toContain('no option matching');
  expect((field.el as HTMLInputElement).value).toBe('');
});

function filteringCombobox(input: HTMLInputElement, listbox: HTMLElement, items: string[], serverSide = false) {
  const render = () => {
    const query = input.value.trim().toLowerCase();
    const visible = serverSide && !query ? [] : items.filter((item) => item.toLowerCase().includes(query));
    listbox.innerHTML = visible.map((item) => `<div role="option">${item}</div>`).join('');
    listbox.hidden = visible.length === 0;
  };

  const open = () => render();
  input.addEventListener('focus', open);
  input.addEventListener('keydown', open);
  input.addEventListener('input', open);

  listbox.addEventListener('mousedown', (event) => {
    const option = (event.target as HTMLElement).closest('[role="option"]');
    if (!option) return;
    const chosen = document.createElement('span');
    chosen.className = 'select__value';
    chosen.textContent = option.textContent;
    input.parentElement!.prepend(chosen);
    input.value = '';
    listbox.hidden = true;
  });
}

test('a dropdown is read before it is typed into, so differently worded options still match', async () => {
  const fields = render(`
    <div id="l">Degree</div>
    <div class="select__control">
      <input role="combobox" aria-labelledby="l" aria-controls="lb">
    </div>
    <div id="lb" role="listbox" hidden></div>`);

  const field = fields.find((f) => f.control === 'combobox')!;
  filteringCombobox(field.el as HTMLInputElement, document.getElementById('lb')!, [
    'High School', "Associate's Degree", "Bachelor's Degree", "Master's Degree"
  ]);

  const outcome = await fillField(field, 'B.S.');

  expect(outcome.ok).toBe(true);
  expect(outcome.applied).toBe("Bachelor's Degree");
});

test('a search-as-you-type box is still typed into, and never picks a stranger', async () => {
  const fields = render(`
    <div id="l">Location (City)</div>
    <div class="select__control">
      <input role="combobox" aria-labelledby="l" aria-controls="lb">
    </div>
    <div id="lb" role="listbox" hidden></div>`);

  const field = fields.find((f) => f.control === 'combobox')!;
  filteringCombobox(field.el as HTMLInputElement, document.getElementById('lb')!, [
    'San Francisco, Cebu, Philippines', 'San Francisco, CA, United States', 'San Francisco, Córdoba, Argentina'
  ], true);

  const outcome = await fillField(field, 'San Francisco, CA');

  expect(outcome.ok).toBe(true);
  expect(outcome.applied).toBe('San Francisco, CA, United States');
});

test('a typeahead with nothing suitable is left empty rather than given a stranger', async () => {
  const fields = render(`
    <div id="l">Location (City)</div>
    <div class="select__control">
      <input role="combobox" aria-labelledby="l" aria-controls="lb">
    </div>
    <div id="lb" role="listbox" hidden></div>`);

  const field = fields.find((f) => f.control === 'combobox')!;
  filteringCombobox(field.el as HTMLInputElement, document.getElementById('lb')!, [
    'San Francisco, Cebu, Philippines', 'San Francisco, Córdoba, Argentina'
  ], true);

  const outcome = await fillField(field, 'San Francisco, CA');

  expect(outcome.ok).toBe(false);
  expect(document.querySelector('.select__value')).toBeNull();
  expect((field.el as HTMLInputElement).value).toBe('');
}, 15000);

test('a dropdown that already holds a choice is read as filled, not offered again', () => {

  const fields = render(`
    <div id="l">School</div>
    <div class="select__control">
      <span class="select__value">Florida International University</span>
      <input role="combobox" aria-labelledby="l" aria-controls="lb" value="">
    </div>
    <div id="lb" role="listbox" hidden></div>`);

  const field = fields.find((f) => f.control === 'combobox')!;
  expect(readValue(field)).toBe('Florida International University');
});

test('a debounced search box is not judged on the previous query\'s results', async () => {
  const fields = render(`
    <div id="l">Location (City)</div>
    <div class="select__control">
      <input role="combobox" aria-labelledby="l" aria-controls="lb">
    </div>
    <div id="lb" role="listbox" hidden></div>`);

  const field = fields.find((f) => f.control === 'combobox')!;
  const input = field.el as HTMLInputElement;
  const listbox = document.getElementById('lb')!;

  const RESULTS: Record<string, string[]> = {
    'san francisco, ca': ['San Francisco, Cebu, Philippines', 'San Francisco Caballua, Oaxaca, Mexico'],
    'san francisco, california': ['San Francisco, California, United States', 'South San Francisco, California, United States'],
    'san francisco': ['San Francisco, Cebu, Philippines'],
    san: ['Santiago, Chile']
  };
  let timer: ReturnType<typeof setTimeout> | null = null;

  input.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    const query = input.value.trim().toLowerCase();
    timer = setTimeout(() => {
      const items = RESULTS[query] ?? [];
      listbox.innerHTML = items.map((item) => `<div role="option">${item}</div>`).join('');
      listbox.hidden = items.length === 0;
    }, 250);
  });

  listbox.addEventListener('mousedown', (event) => {
    const option = (event.target as HTMLElement).closest('[role="option"]');
    if (!option) return;
    const chosen = document.createElement('span');
    chosen.className = 'select__value';
    chosen.textContent = option.textContent;
    input.parentElement!.prepend(chosen);
    input.value = '';
    listbox.hidden = true;
  });

  const outcome = await fillField(field, 'San Francisco, CA');

  expect(outcome.ok).toBe(true);
  expect(outcome.applied).toBe('San Francisco, California, United States');
}, 15000);
