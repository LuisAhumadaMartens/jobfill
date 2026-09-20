import { describe, expect, test } from 'bun:test';
import { observationsFor, ownValues } from '../src/lib/dex/collect.ts';
import { batches, COALESCE_MS, dueToSend, merge, QUEUE_CAP } from '../src/lib/dex/queue.ts';
import type { FieldPlan, SerializedField } from '../src/shared/types.ts';
import type { Observation } from '../src/shared/dex.ts';

const PROFILE = { firstName: 'Luis', lastName: 'Ahumada', email: 'luis@weareinit.org', city: 'San Francisco', phone: '+14155550123' };

function field(over: Partial<SerializedField> = {}): SerializedField {
  return {
    uid: 'f1', control: 'select', type: '', name: '', id: '', label: 'What are your compensation expectations?',
    context: '', placeholder: '', pattern: '', maxLength: null, required: true, kind: null, currentValue: '',
    options: [], ...over
  };
}

function plan(over: Partial<FieldPlan> = {}): FieldPlan {
  return { field: field(), frameId: 0, status: 'unknown', ...over };
}

describe('turning a struggle into an observation', () => {
  test('an unmatched question on a known board is collected', () => {
    const [observation] = observationsFor([plan()], 'boards.greenhouse.io', PROFILE);
    expect(observation.ats).toBe('greenhouse.io');
    expect(observation.outcome).toBe('unmatched');
  });

  test('the host never reaches the observation, only the board', () => {
    const [observation] = observationsFor([plan()], 'acme.jobs.ashbyhq.com', PROFILE);
    expect(observation.ats).toBe('ashbyhq.com');
    expect(JSON.stringify(observation)).not.toContain('acme');
  });

  test('a page that is not a known board is never collected', () => {
    expect(observationsFor([plan()], 'careers.acme.com', PROFILE)).toEqual([]);
  });

  test('a field that filled cleanly has nothing to teach', () => {
    expect(observationsFor([plan({ status: 'filled' })], 'boards.greenhouse.io', PROFILE)).toEqual([]);
    expect(observationsFor([plan({ status: 'skipped' })], 'boards.greenhouse.io', PROFILE)).toEqual([]);
  });

  test('a question naming the user is dropped', () => {
    const named = plan({ field: field({ label: 'Confirm that Luis Ahumada is your legal name' }) });
    expect(observationsFor([named], 'boards.greenhouse.io', PROFILE)).toEqual([]);
  });

  test('an option naming the user drops the whole observation', () => {
    const named = plan({ field: field({ options: [{ value: '1', text: 'San Francisco' }, { value: '2', text: 'Remote' }] }) });
    expect(observationsFor([named], 'boards.greenhouse.io', PROFILE)).toEqual([]);
  });

  test('a demographic question is dropped before it is ever queued', () => {
    const eeo = plan({ field: field({ label: 'Please select the gender you identify with' }) });
    expect(observationsFor([eeo], 'boards.greenhouse.io', PROFILE)).toEqual([]);
  });

  test('the same question is only collected once', () => {
    const plans = [plan(), plan({ field: field({ uid: 'f2' }) })];
    expect(observationsFor(plans, 'boards.greenhouse.io', PROFILE)).toHaveLength(1);
  });

  test('a fill that did not hold is reported as cleared', () => {
    const failed = plan({ status: 'failed', value: 'Yes' });
    expect(observationsFor([failed], 'boards.greenhouse.io', PROFILE)[0].outcome).toBe('cleared');
  });

  test('a dropdown with no fitting option is told apart from one that was cleared', () => {
    const none = plan({ status: 'failed', field: field({ options: [{ value: '1', text: 'Yes' }, { value: '2', text: 'No' }] }) });
    expect(observationsFor([none], 'boards.greenhouse.io', PROFILE)[0].outcome).toBe('no-option');
  });

  test('short profile values never become a filter', () => {
    expect(ownValues({ state: 'CA', firstName: 'Luis' })).toEqual(['luis']);
  });
});

describe('the local queue', () => {
  const observation = (question: string): Observation => ({
    ats: 'greenhouse.io', control: 'select', question, options: [], outcome: 'unmatched', kind: null, confidence: null
  });

  test('merging drops what is already queued', () => {
    const queue = [observation('What are your compensation expectations?')];
    expect(merge(queue, [observation('What are your compensation expectations?')])).toHaveLength(1);
    expect(merge(queue, [observation('Why us?')])).toHaveLength(2);
  });

  test('the queue never grows past its cap', () => {
    const queue = Array.from({ length: QUEUE_CAP }, (_, index) => observation(`Question number ${index} here`));
    const merged = merge(queue, [observation('One more question to ask')]);
    expect(merged).toHaveLength(QUEUE_CAP);
    expect(merged.at(-1)!.question).toBe('One more question to ask');
  });

  test('a long queue is sent in batches the server will accept', () => {
    const queue = Array.from({ length: 120 }, (_, index) => observation(`Question number ${index} here`));
    const chunks = batches(queue);
    expect(chunks).toHaveLength(3);
    expect(chunks.every((chunk) => chunk.length <= 50)).toBe(true);
  });
});

describe('deciding when to send on its own', () => {
  const base = { granted: true, askAfterApplying: true, autoSend: true, lastSentAt: null, sentTotal: 0 };
  const now = Date.parse('2026-09-20T12:00:00.000Z');

  test('a question goes as soon as it is saved', () => {
    expect(dueToSend(base, 1, now)).toBe(true);
  });

  test('nothing goes when nothing new was saved', () => {
    expect(dueToSend(base, 0, now)).toBe(false);
  });

  test('nothing goes while sharing is turned off', () => {
    expect(dueToSend({ ...base, autoSend: false }, 3, now)).toBe(false);
  });

  test('nothing goes before the browser has granted the permission', () => {
    expect(dueToSend({ ...base, granted: false }, 3, now)).toBe(false);
  });

  test('a burst of frames reporting at once becomes one send, not five', () => {
    const justSent = { ...base, lastSentAt: new Date(now - 1000).toISOString() };
    expect(dueToSend(justSent, 3, now)).toBe(false);
  });

  test('the next question after that burst still goes', () => {
    const settled = { ...base, lastSentAt: new Date(now - COALESCE_MS - 1).toISOString() };
    expect(dueToSend(settled, 1, now)).toBe(true);
  });

  test('an unreadable timestamp does not wedge it shut forever', () => {
    expect(dueToSend({ ...base, lastSentAt: 'not a date' }, 1, now)).toBe(true);
  });
});
