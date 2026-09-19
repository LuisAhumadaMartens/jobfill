import { describe, expect, test } from 'bun:test';
import { fillTemplate, hasPlaceholders, pageContextFrom } from '../src/lib/values/template.ts';

describe('knowing what the page is advertising', () => {
  test('the titles these boards actually use', () => {
    expect(pageContextFrom('Job Application for Software Engineer, Consumer Engineering at Reddit'))
      .toMatchObject({ role: 'Software Engineer, Consumer Engineering', company: 'Reddit' });
    expect(pageContextFrom('Developer, Full Stack/iOS @ 1Password'))
      .toMatchObject({ role: 'Developer, Full Stack/iOS', company: '1Password' });
    expect(pageContextFrom('Software Engineer, Systems @ The Browser Company'))
      .toMatchObject({ company: 'The Browser Company' });
  });

  test('a title it cannot read leaves the placeholders alone', () => {
    const context = pageContextFrom('Careers');
    expect(context.company).toBeUndefined();
    expect(fillTemplate('I admire {company}.', context)).toBe('I admire {company}.');
  });
});

describe('filling a written answer in', () => {
  const context = pageContextFrom('Developer, Full Stack/iOS @ 1Password');

  test('company and role are replaced', () => {
    expect(fillTemplate('Why {company}? Because the {role} work is what I want.', context))
      .toBe('Why 1Password? Because the Developer, Full Stack/iOS work is what I want.');
  });

  test('spacing and case in the placeholder do not matter', () => {
    expect(fillTemplate('{ COMPANY } and {Role}', context)).toBe('1Password and Developer, Full Stack/iOS');
  });

  test('an answer with no placeholders is untouched', () => {
    expect(hasPlaceholders('Just a plain answer')).toBe(false);
    expect(fillTemplate('Just a plain answer', context)).toBe('Just a plain answer');
  });
});
