import { beforeEach, expect, test } from 'bun:test';
import { scan } from '../src/content/scanner.ts';
import { fillField } from '../src/content/filler.ts';
import { makeAnswer } from '../src/lib/answers/storage.ts';
import type { ScannedField } from '../src/shared/types.ts';

function render(html: string): ScannedField[] {
  document.documentElement.innerHTML = html;
  return scan(document);
}

beforeEach(() => {
  document.documentElement.innerHTML = '';
});

test('typing into a text input fires the events a framework listens for', async () => {
  const [field] = render('<label for="a">First Name</label><input id="a" name="first_name">');
  const seen: string[] = [];
  for (const name of ['input', 'change']) field!.el.addEventListener(name, () => seen.push(name));

  const outcome = await fillField(field!, 'Ada');

  expect(outcome.ok).toBe(true);
  expect((field!.el as HTMLInputElement).value).toBe('Ada');
  expect(seen).toEqual(['input', 'input', 'change']);
});

test('a select takes the option that means our answer, not the literal text', async () => {
  const [field] = render(`
    <label for="s">Will you now or in the future require sponsorship?</label>
    <select id="s" name="spons">
      <option value="">Please select</option>
      <option>Yes, I will require sponsorship</option>
      <option>No, I will not require sponsorship</option>
    </select>`);

  const outcome = await fillField(field!, 'No');

  expect(outcome.ok).toBe(true);
  expect(outcome.applied).toBe('No, I will not require sponsorship');
  expect((field!.el as HTMLSelectElement).value).toBe('No, I will not require sponsorship');
});

test('a radio group picks the matching choice', async () => {
  const [field] = render(`
    <fieldset><legend>Are you willing to relocate?</legend>
      <label><input type="radio" name="reloc" value="yes"> Yes</label>
      <label><input type="radio" name="reloc" value="no"> No</label>
    </fieldset>`);

  const outcome = await fillField(field!, 'Yes');

  expect(outcome.ok).toBe(true);
  expect(document.querySelector<HTMLInputElement>('input[value="yes"]')?.checked).toBe(true);
  expect(document.querySelector<HTMLInputElement>('input[value="no"]')?.checked).toBe(false);
});

test('a lone checkbox reads a yes/no answer', async () => {
  const [field] = render('<label><input type="checkbox" name="terms"> I confirm the above is accurate</label>');

  await fillField(field!, 'Yes');
  expect(document.querySelector<HTMLInputElement>('input')?.checked).toBe(true);
});

test('a value longer than the field allows is trimmed, and says so', async () => {
  const [field] = render('<label for="w">Why do you want to work here?</label><textarea id="w" maxlength="10"></textarea>');

  const outcome = await fillField(field!, 'Because the product is genuinely good');

  expect(outcome.ok).toBe(true);
  expect((field!.el as HTMLTextAreaElement).value).toHaveLength(10);
  expect(outcome.reason).toContain('10 character limit');
});

test('a value no option matches fails loudly instead of picking something', async () => {
  const [field] = render(`
    <label for="s">Favourite colour</label>
    <select id="s"><option>Blue</option><option>Green</option></select>`);

  const outcome = await fillField(field!, 'Yes');

  expect(outcome.ok).toBe(false);
  expect(outcome.reason).toContain('No option matching');
});

test('a wording taught for this answer wins over a fuzzy option match', async () => {
  const [field] = render(`
    <label for="s">Work authorization</label>
    <select id="s">
      <option>Not authorized</option>
      <option>Authorized without sponsorship</option>
    </select>`);

  const answer = makeAnswer({
    question: 'Work authorization',
    value: 'Yes',
    valueAliases: { Yes: ['Authorized without sponsorship'] }
  });

  const outcome = await fillField(field!, 'Yes', answer);
  expect(outcome.applied).toBe('Authorized without sponsorship');
});
