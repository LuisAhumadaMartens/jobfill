import { beforeEach, describe, expect, test } from 'bun:test';
import { buildReviewItems, type FieldValue } from '../src/lib/answers/review.ts';
import * as storage from '../src/lib/answers/storage.ts';
import type { SerializedField } from '../src/shared/types.ts';

function field(label: string, over: Partial<SerializedField> = {}): SerializedField {
  return {
    uid: over.uid ?? 'f_' + label.slice(0, 6).replace(/\W/g, ''),
    control: 'input',
    type: 'text',
    name: '',
    id: '',
    label,
    context: '',
    placeholder: '',
    required: false,
    kind: null,
    currentValue: '',
    options: [],
    ...over
  };
}

const entry = (label: string, value: string, over: Partial<SerializedField> = {}): FieldValue =>
  ({ field: field(label, over), value });

beforeEach(async () => {
  await storage.clearAll();
});

describe('what gets offered after submitting', () => {
  test('a question JobFill has never seen is offered whole', async () => {
    const answers = await storage.getAnswers();
    const items = buildReviewItems([entry('How did you hear about this job?', 'A friend at the company')], answers);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ action: 'new', question: 'How did you hear about this job?', value: 'A friend at the company' });
  });

  test('a known question answered differently is offered as an update', async () => {

    const seed = (await storage.getAnswers()).find((a) => a.kind === 'relocation')!;
    const answer = await storage.upsertAnswer({ id: seed.id, value: 'No' });
    const answers = await storage.getAnswers();

    const items = buildReviewItems([entry('Are you willing to relocate?', 'Yes')], answers);
    expect(items[0]).toMatchObject({ action: 'update', answerId: answer.id, value: 'Yes', previous: 'No' });
  });

  test('the same answer worded differently is offered as a wording to learn', async () => {
    const seed = (await storage.getAnswers()).find((a) => a.kind === 'relocation')!;
    const answer = await storage.upsertAnswer({ id: seed.id, value: 'Yes' });
    const answers = await storage.getAnswers();

    const items = buildReviewItems([entry('Would you consider relocating for this role?', 'Yes')], answers);
    expect(items[0]).toMatchObject({ action: 'alias', answerId: answer.id });
  });

  test('nothing is offered when JobFill already knew it, wording and all', async () => {
    const seed = (await storage.getAnswers()).find((a) => a.kind === 'relocation')!;
    await storage.upsertAnswer({ id: seed.id, value: 'Yes' });
    const answers = await storage.getAnswers();

    expect(buildReviewItems([entry('Are you willing to relocate?', 'Yes')], answers)).toHaveLength(0);
  });

  test('empty fields, files and unanswered dropdowns are left alone', async () => {
    const answers = await storage.getAnswers();
    const items = buildReviewItems([
      entry('Cover letter', ''),
      entry('Resume/CV', 'my-cv.pdf', { control: 'file' }),
      entry('Gender', 'Select...', { control: 'select' })
    ], answers);

    expect(items).toHaveLength(0);
  });

  test('the type comes from the control it was answered in', async () => {
    const answers = await storage.getAnswers();
    const items = buildReviewItems([
      entry('Why do you want to work here?', 'Because of the product.', { control: 'textarea' }),
      entry('Preferred pronouns', 'they/them')
    ], answers);

    expect(items.find((item) => item.control === 'textarea')?.type).toBe('longtext');
    expect(items.find((item) => item.question === 'Preferred pronouns')?.type).toBe('text');
  });
});

describe('saving what was ticked', () => {
  test('creates, updates and learns, then clears the review', async () => {
    const seed = (await storage.getAnswers()).find((a) => a.kind === 'relocation')!;
    const existing = await storage.upsertAnswer({ id: seed.id, value: 'No' });
    const before = (await storage.load()).stats.applications;

    const tally = await storage.applyReview([
      { uid: 'a', question: 'How did you hear about this job?', value: 'A friend', kind: null, control: 'input', type: 'text', action: 'new' },
      { uid: 'b', question: 'Open to relocation?', value: 'Yes', kind: null, control: 'select', type: 'choice', action: 'update', answerId: existing.id, previous: 'No' }
    ]);

    expect(tally).toMatchObject({ created: 1, updated: 1 });

    const state = await storage.load();
    expect(state.pendingReview).toBeNull();
    expect(state.stats.applications).toBe(before + 1);

    const updated = state.answers.find((answer) => answer.id === existing.id)!;
    expect(updated.value).toBe('Yes');

    expect(updated.aliases).toContain('Open to relocation?');
    expect(state.answers.some((answer) => answer.question === 'How did you hear about this job?')).toBe(true);
  });

  test('a parked review is only offered on the site it came from, and expires', async () => {
    await storage.setPendingReview({
      host: 'job-boards.greenhouse.io',
      url: 'https://job-boards.greenhouse.io/x',
      title: 'Apply',
      capturedAt: new Date().toISOString(),
      items: [{ uid: 'a', question: 'Q', value: 'V', kind: null, control: 'input', type: 'text', action: 'new' }]
    });

    expect(await storage.getPendingReview('job-boards.greenhouse.io')).not.toBeNull();
    expect(await storage.getPendingReview('example.com')).toBeNull();
  });

  test('and is forgotten once it is stale', async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    await storage.setPendingReview({
      host: 'job-boards.greenhouse.io',
      url: 'https://job-boards.greenhouse.io/x',
      title: 'Apply',
      capturedAt: threeHoursAgo,
      items: [{ uid: 'a', question: 'Q', value: 'V', kind: null, control: 'input', type: 'text', action: 'new' }]
    });

    expect(await storage.getPendingReview('job-boards.greenhouse.io')).toBeNull();

    expect((await storage.load()).pendingReview).toBeNull();
  });
});
