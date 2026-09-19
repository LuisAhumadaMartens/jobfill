import { describe, expect, test } from 'bun:test';
import { formatPhone, isSamePhone, parsePhone, renderPhone, shapeFor } from '../src/lib/values/phone.ts';
import { canonicalUrl, isSameUrl, looksLikeUrl } from '../src/lib/values/url.ts';

describe('reading a phone number', () => {
  test('every way a form gave the same number back', () => {
    const written = ['+1 (786) 830-6320', '+17868306320', '+1 786-830-6320', '786-830-6320', '(786) 830-6320', '7868306320'];
    for (const value of written) {
      expect(parsePhone(value)?.e164).toBe('+17868306320');
    }
  });

  test('all of those count as the same number', () => {
    expect(isSamePhone('+1 (786) 830-6320', '+17868306320')).toBe(true);
    expect(isSamePhone('+17868306320', '+1 786-830-6320')).toBe(true);
    expect(isSamePhone('786-830-6320', '(786) 830-6320')).toBe(true);
    expect(isSamePhone('+17868306320', '+17868306321')).toBe(false);
  });

  test('international numbers keep their country', () => {
    expect(parsePhone('+44 20 7946 0958')?.country).toBe('44');
    expect(parsePhone('+34 612 345 678')?.country).toBe('34');
    expect(parsePhone('+52 55 1234 5678')?.e164).toBe('+525512345678');
  });

  test('nonsense is not a phone number', () => {
    expect(parsePhone('')).toBeNull();
    expect(parsePhone('Yes')).toBeNull();
    expect(parsePhone('12345')).toBeNull();
  });
});

describe('writing a phone number the way a field wants it', () => {
  const phone = parsePhone('+17868306320')!;

  test('the shapes forms ask for', () => {
    expect(formatPhone(phone, { style: 'e164', withCountry: true })).toBe('+17868306320');
    expect(formatPhone(phone, { style: 'digits', withCountry: false })).toBe('7868306320');
    expect(formatPhone(phone, { style: 'national-parens', withCountry: false })).toBe('(786) 830-6320');
    expect(formatPhone(phone, { style: 'national-dashes', withCountry: false })).toBe('786-830-6320');
    expect(formatPhone(phone, { style: 'international', withCountry: true })).toBe('+1 786-830-6320');
  });

  test('a length limit strips punctuation rather than truncating the number', () => {
    expect(formatPhone(phone, { style: 'national-parens', withCountry: false, maxLength: 10 })).toBe('7868306320');
    expect(formatPhone(phone, { style: 'e164', withCountry: true, maxLength: 11 })).toBe('17868306320');
  });

  test('the field tells us the shape', () => {
    expect(shapeFor({ placeholder: '(555) 555-5555' }).style).toBe('national-parens');
    expect(shapeFor({ placeholder: '555-555-5555' }).style).toBe('national-dashes');
    expect(shapeFor({ placeholder: '+1 555 555 5555' })).toMatchObject({ style: 'international', withCountry: true });
    expect(shapeFor({ maxLength: 10 })).toMatchObject({ style: 'digits', withCountry: false });
    expect(shapeFor({ pattern: '[0-9]{10}' })).toMatchObject({ style: 'digits' });
  });

  test('a separate country selector means the field wants the national number', () => {
    expect(shapeFor({ hasCountryControl: true }).withCountry).toBe(false);
    expect(renderPhone('+17868306320', { hasCountryControl: true })).toBe('786-830-6320');
  });

  test('with no hints at all it stays unambiguous', () => {
    expect(renderPhone('+1 (786) 830-6320', {})).toBe('+1 786-830-6320');
  });
});

describe('urls', () => {
  test('the same profile written differently', () => {
    expect(isSameUrl('https://linkedin.com/in/luis', 'https://www.linkedin.com/in/luis')).toBe(true);
    expect(isSameUrl('linkedin.com/in/luis', 'https://linkedin.com/in/luis/')).toBe(true);
    expect(isSameUrl('https://linkedin.com/in/luis', 'https://linkedin.com/in/someone')).toBe(false);
  });

  test('tracking noise is not part of the address', () => {
    expect(isSameUrl('https://linkedin.com/in/luis', 'https://www.linkedin.com/in/luis?utm_source=x')).toBe(true);
  });

  test('canonical form drops the scheme and www', () => {
    expect(canonicalUrl('https://www.ahumada.dev/')).toBe('ahumada.dev');
  });

  test('knows what is not a url', () => {
    expect(looksLikeUrl('https://ahumada.dev')).toBe(true);
    expect(looksLikeUrl('ahumada.dev')).toBe(true);
    expect(looksLikeUrl('San Francisco, CA')).toBe(false);
    expect(looksLikeUrl('Yes')).toBe(false);
  });
});
