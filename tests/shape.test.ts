import { describe, expect, test } from 'bun:test';
import { shapeValue, toIsoDate, toMonthValue, toNumber } from '../src/lib/values/shape.ts';

describe('writing a value the way the input type demands', () => {
  test('a number input gets a whole number', () => {

    expect(shapeValue('1.5', { type: 'number' })).toBe('2');
    expect(shapeValue('1.2', { type: 'number' })).toBe('1');
    expect(shapeValue('10', { type: 'number' })).toBe('10');
  });

  test('unless the field says fractions are fine', () => {
    expect(shapeValue('1.5', { type: 'number', step: 'any' })).toBe('1.5');
    expect(shapeValue('1.5', { type: 'number', step: '0.5' })).toBe('1.5');
  });

  test('a number is kept inside the range the field allows', () => {
    expect(shapeValue('20', { type: 'number', max: '10' })).toBe('10');
    expect(shapeValue('0', { type: 'number', min: '1' })).toBe('1');
  });

  test('a date input gets ISO, from whatever we stored', () => {
    expect(toIsoDate('05/2018')).toBe('2018-05-01');
    expect(toIsoDate('12/31/2024')).toBe('2024-12-31');
    expect(toIsoDate('2024-12-31')).toBe('2024-12-31');
    expect(toIsoDate('2018')).toBe('2018-01-01');
    expect(toIsoDate('sometime')).toBeNull();
  });

  test('a month input gets year and month only', () => {
    expect(toMonthValue('05/2018')).toBe('2018-05');
  });

  test('text fields are left exactly as they are', () => {
    expect(shapeValue('San Francisco, CA', { type: 'text' })).toBe('San Francisco, CA');
    expect(shapeValue('Yes', {})).toBe('Yes');
  });

  test('nonsense in a number field is left for the user rather than mangled', () => {
    expect(toNumber('quite a lot', { type: 'number' })).toBeNull();
    expect(shapeValue('quite a lot', { type: 'number' })).toBe('quite a lot');
  });
});
