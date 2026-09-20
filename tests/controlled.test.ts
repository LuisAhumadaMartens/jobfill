import { beforeEach, expect, test } from 'bun:test';
import { readValue, scan } from '../src/content/scanner.ts';
import { fillField, restoreValue } from '../src/content/filler.ts';
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

test('a phone field gets the shape it asks for, not the shape we stored', async () => {
  const shapes = [
    ['<input id="p" type="tel" placeholder="(555) 555-5555">', '(786) 830-6320'],
    ['<input id="p" type="tel" placeholder="555-555-5555">', '786-830-6320'],
    ['<input id="p" type="tel" maxlength="10">', '7868306320'],
    ['<input id="p" type="tel" pattern="[0-9]{10}">', '7868306320'],
    ['<input id="p" type="tel">', '+1 786-830-6320']
  ] as const;

  for (const [markup, expected] of shapes) {
    const [field] = render(`<label for="p">Phone</label>${markup}`);
    const outcome = await fillField(field!, '+17868306320');
    expect(outcome.applied).toBe(expected);
    expect((field!.el as HTMLInputElement).value).toBe(expected);
  }
});

test('a phone field beside a dial-code selector gets only the national number', async () => {
  const fields = render(`
    <form>
      <label for="c">Country</label>
      <select id="c" name="country"><option>Select</option><option>United States +1</option><option>Mexico +52</option></select>
      <label for="p">Phone</label>
      <input id="p" type="tel" name="phone">
    </form>`);

  const phone = fields.find((f) => f.kind === 'phone')!;
  const country = fields.find((f) => f.control === 'select')!;

  const outcome = await fillField(phone, '+17868306320', undefined, { countryField: country, country: 'United States' });

  expect(outcome.applied).toBe('786-830-6320');
  expect((country.el as HTMLSelectElement).value).toBe('United States +1');
});

test('a checkbox built out of a div is read and ticked like any other', async () => {
  const [field] = render(`
    <div id="l">I agree to the terms</div>
    <div role="checkbox" aria-checked="false" aria-labelledby="l" tabindex="0"></div>`);

  expect(field!.control).toBe('checkbox');
  const outcome = await fillField(field!, 'Yes');

  expect(outcome.ok).toBe(true);
  expect(field!.el.getAttribute('aria-checked')).toBe('true');
  expect(readValue(field!)).toBe('Yes');
});

test('an ARIA radio group is one question with real choices', async () => {
  const [field] = render(`
    <div id="l">Are you willing to relocate?</div>
    <div role="radiogroup" aria-labelledby="l">
      <div role="radio" aria-checked="false">Yes</div>
      <div role="radio" aria-checked="false">No</div>
    </div>`);

  expect(field!.control).toBe('radio');
  expect(field!.options.map((option) => option.text)).toEqual(['Yes', 'No']);

  await fillField(field!, 'Yes');
  expect(document.querySelectorAll('[role="radio"]')[0]!.getAttribute('aria-checked')).toBe('true');
  expect(readValue(field!)).toBe('Yes');
});

test('a yes/no pair of buttons is a question, not two', async () => {
  const fields = render(`
    <div class="field">
      <span id="l">Are you legally authorized to work in the United States?</span>
      <div class="group">
        <button type="button" aria-pressed="false">Yes</button>
        <button type="button" aria-pressed="false">No</button>
      </div>
    </div>`);

  const group = fields.find((f) => f.control === 'radio');
  expect(group).toBeDefined();
  expect(group!.options.map((option) => option.text)).toEqual(['Yes', 'No']);

  await fillField(group!, 'Yes');
  expect(document.querySelectorAll('button')[0]!.getAttribute('aria-pressed')).toBe('false');
});

test('undo puts every kind of field back the way it was', async () => {
  const fields = render(`
    <form>
      <label for="t">First Name</label><input id="t" name="first_name" value="Original">
      <label for="s">Are you willing to relocate?</label>
      <select id="s" name="reloc"><option>Yes</option><option>No</option></select>
      <label><input type="checkbox" name="terms"> I agree</label>
    </form>`);

  const text = fields.find((f) => f.control === 'input')!;
  const select = fields.find((f) => f.control === 'select')!;
  const checkbox = fields.find((f) => f.control === 'checkbox')!;

  const before = fields.map((field) => readValue(field));

  await fillField(text, 'Replaced');
  await fillField(select, 'No');
  await fillField(checkbox, 'Yes');

  expect(readValue(text)).toBe('Replaced');
  expect(readValue(checkbox)).toBe('Yes');

  fields.forEach((field, index) => restoreValue(field, before[index]!));

  expect(readValue(text)).toBe('Original');
  expect(readValue(select)).toBe('Yes');
  expect(readValue(checkbox)).toBe('');
});
