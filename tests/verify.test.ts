import { describe, expect, test } from 'bun:test';
import { verifyValue, verdictNote } from '../src/lib/matching/verify.ts';
import { makeAnswer } from '../src/lib/answers/storage.ts';

describe('checking what stuck', () => {
  test('the value we filled is still there', () => {
    expect(verifyValue({ control: 'input', expected: 'Luis', current: 'Luis' })).toBe('held');
    expect(verifyValue({ control: 'select', expected: 'Yes', current: 'Yes' })).toBe('held');
  });

  test('a site expanding what we chose is still our answer', () => {
    expect(verifyValue({
      control: 'combobox',
      expected: 'San Francisco, CA',
      current: 'San Francisco, California, United States'
    })).toBe('held');
  });

  test('a field the page emptied is reported', () => {
    expect(verifyValue({ control: 'select', expected: 'Yes', current: '' })).toBe('cleared');
  });

  test('a field the page changed under us is reported', () => {
    expect(verifyValue({
      control: 'combobox',
      expected: 'San Francisco, CA',
      current: 'San Francisco, Cebu, Philippines'
    })).toBe('replaced');
  });

  test('a dropdown whose selection we cannot see is not called empty', () => {

    expect(verifyValue({ control: 'combobox', expected: 'B.S.', current: '' })).toBe('unreadable');
  });

  test('a file input the page has taken over is not called empty either', () => {
    expect(verifyValue({ control: 'file', expected: 'cv.pdf', current: '' })).toBe('unreadable');
  });

  test('a contenteditable can be read, so an empty one really is empty', () => {
    expect(verifyValue({ control: 'contenteditable', expected: 'Text', current: '' })).toBe('cleared');
    expect(verifyValue({ control: 'contenteditable', expected: 'Text', current: 'Text' })).toBe('held');
  });

  test('a checkbox is judged as the yes/no it is', () => {
    expect(verifyValue({ control: 'checkbox', expected: 'Yes', current: 'Yes' })).toBe('held');

    expect(verifyValue({ control: 'checkbox', expected: 'No', current: '' })).toBe('held');
    expect(verifyValue({ control: 'checkbox', expected: 'Yes', current: '' })).toBe('cleared');
  });

  test('a page swapping our answer for a different one is not waved through', () => {
    expect(verifyValue({ control: 'select', expected: 'No', current: 'Decline to self-identify' })).toBe('replaced');
    expect(verifyValue({ control: 'select', expected: 'Yes', current: 'I am authorized' })).toBe('replaced');
  });

  test('the same value said differently is still held', () => {
    expect(verifyValue({ control: 'select', expected: 'United States', current: 'USA' })).toBe('held');
  });

  test('the wording a site uses for our value counts as held', () => {
    const answer = makeAnswer({
      question: 'Work authorization',
      value: 'Yes',
      valueAliases: { Yes: ['Authorized without sponsorship'] }
    });
    expect(verifyValue({ control: 'select', expected: 'Yes', current: 'Authorized without sponsorship', answer })).toBe('held');
  });

  test('notes explain themselves, and say nothing when there is nothing to say', () => {
    expect(verdictNote('replaced', 'Oakland, CA')).toContain('Oakland, CA');
    expect(verdictNote('cleared', '')).toContain('Set it by hand');
    expect(verdictNote('held', 'x')).toBeUndefined();
    expect(verdictNote('unreadable', '')).toBeUndefined();
  });
});
