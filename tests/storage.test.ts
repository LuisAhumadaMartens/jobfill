import { beforeEach, describe, expect, test } from 'bun:test';
import * as storage from '../src/lib/answers/storage.ts';

beforeEach(async () => {
  await storage.clearAll();
});

test('a fresh install comes with a usable answer library', async () => {
  const state = await storage.load();
  expect(state.answers.length).toBeGreaterThan(10);
  expect(state.answers.some((answer) => answer.kind === 'workAuthorization')).toBe(true);
  expect(state.settings.autofillOnLoad).toBe(false);
});

test('answers round-trip through upsert', async () => {
  const created = await storage.upsertAnswer({ question: 'Favourite editor?', value: 'Neovim' });
  expect(created.id).toStartWith('ans_');

  const updated = await storage.upsertAnswer({ id: created.id, value: 'Zed' });
  expect(updated.value).toBe('Zed');
  expect(updated.createdAt).toBe(created.createdAt);

  const answers = await storage.getAnswers();
  expect(answers.filter((answer) => answer.question === 'Favourite editor?')).toHaveLength(1);
});

test('teaching a wording adds it once, however it is punctuated', async () => {
  const answer = await storage.upsertAnswer({ question: 'Why do you want to work here?', value: 'The product.' });

  await storage.addAlias(answer.id, 'What excites you about this role?');
  await storage.addAlias(answer.id, 'What excites you about this role?');
  await storage.addAlias(answer.id, '  What excites you about this role? ');
  const taught = (await storage.getAnswers()).find((a) => a.id === answer.id)!;

  expect(taught.aliases).toEqual(['What excites you about this role?']);
});

test('a site’s own wording for a value is remembered', async () => {
  const answer = await storage.upsertAnswer({ question: 'Work authorization', value: 'Yes', type: 'choice' });

  await storage.addValueAlias(answer.id, 'Yes', 'Authorized without sponsorship');
  await storage.addValueAlias(answer.id, 'Yes', 'Yes');

  const stored = (await storage.getAnswers()).find((a) => a.id === answer.id)!;
  expect(stored.valueAliases?.Yes).toEqual(['Authorized without sponsorship']);
});

test('the profile mirrors into answers, and clearing a field removes its answer', async () => {
  await storage.setProfile({ firstName: 'Ada', email: 'ada@okonkwo.dev' });
  let answers = await storage.getAnswers();
  const mirrored = answers.filter((answer) => answer.source === 'profile');
  expect(mirrored.map((answer) => answer.kind).sort()).toEqual(['email', 'firstName']);
  expect(mirrored.find((answer) => answer.kind === 'email')?.value).toBe('ada@okonkwo.dev');

  await storage.setProfile({ firstName: 'Ada', email: '' });
  answers = await storage.getAnswers();
  expect(answers.some((answer) => answer.source === 'profile' && answer.kind === 'email')).toBe(false);
});

test('usage counts feed the ranking', async () => {
  const answer = await storage.upsertAnswer({ question: 'Pronouns', value: 'she/her' });
  await storage.recordUse(answer.id);
  await storage.recordUse(answer.id);

  const stored = (await storage.getAnswers()).find((a) => a.id === answer.id)!;
  expect(stored.usageCount).toBe(2);
  expect(stored.lastUsedAt).not.toBeNull();
});

test('export leaves the resume binary behind, import merges by question', async () => {
  await storage.setResume({ name: 'cv.pdf', type: 'application/pdf', size: 1024, dataUrl: 'data:application/pdf;base64,AAA', text: 'Ada', parsedAt: new Date().toISOString() });
  await storage.upsertAnswer({ question: 'Favourite editor?', value: 'Neovim' });

  const exported = await storage.exportAll();
  expect(exported.resume).not.toHaveProperty('dataUrl');
  expect(exported.resume?.text).toBe('Ada');

  await storage.importAll(
    { answers: [{ question: 'Favourite editor?', value: 'Zed', aliases: ['Which editor?'] } as never] },
    { merge: true }
  );

  const answers = await storage.getAnswers();
  const editor = answers.filter((answer) => answer.question === 'Favourite editor?');
  expect(editor).toHaveLength(1);
  expect(editor[0]?.value).toBe('Zed');
  expect(editor[0]?.aliases).toContain('Which editor?');
});

test('a host can be muted and un-muted', async () => {
  await storage.setHostDisabled('workday.com', true);
  expect(await storage.isHostDisabled('acme.workday.com')).toBe(true);
  expect(await storage.isHostDisabled('lever.co')).toBe(false);

  await storage.setHostDisabled('workday.com', false);
  expect(await storage.isHostDisabled('acme.workday.com')).toBe(false);
});

test('knowing where you live answers whether you are in the US', async () => {
  await storage.setProfile({ city: 'San Francisco', state: 'CA', country: 'United States' });
  const located = (await storage.getAnswers()).find((answer) => answer.kind === 'locatedInUS');
  expect(located?.value).toBe('Yes');
});

test('but it never overwrites an answer you gave yourself', async () => {
  const seeded = (await storage.getAnswers()).find((answer) => answer.kind === 'locatedInUS')!;
  await storage.upsertAnswer({ id: seeded.id, value: 'No' });

  await storage.setProfile({ country: 'United States' });

  const located = (await storage.getAnswers()).find((answer) => answer.kind === 'locatedInUS');
  expect(located?.value).toBe('No');
});

describe('repairing data written by an older build', () => {
  test('a kind that cannot fit the answer is dropped, and phones are folded to one form', async () => {

    await storage.patch({
      version: 1,
      profile: { phone: '+1 (786) 830-6320' },
      answers: [
        storage.makeAnswer({ kind: 'phone', type: 'boolean', source: 'user', value: 'Yes',
          question: 'By checking this box, I consent to Reddit collecting, storing, and processing my responses' }),
        storage.makeAnswer({ kind: 'phone', type: 'phone', source: 'profile', question: 'Phone', value: '+1 (786) 830-6320' })
      ]
    });

    const state = await storage.load();
    const consent = state.answers.find((answer) => answer.type === 'boolean')!;
    const phone = state.answers.find((answer) => answer.type === 'phone')!;

    expect(consent.kind).toBeNull();
    expect(phone.kind).toBe('phone');
    expect(phone.value).toBe('+17868306320');
    expect(state.profile.phone).toBe('+17868306320');
    expect(state.version).toBe(2);
  });

  test('the repair runs once, not on every load', async () => {
    const first = await storage.load();
    const second = await storage.load();
    expect(second.version).toBe(first.version);
    expect(second.answers).toEqual(first.answers);
  });
});

describe('nothing about status is assumed', () => {
  test('a fresh install has no work authorization answer', async () => {
    const answers = await storage.getAnswers();
    const auth = answers.find((answer) => answer.kind === 'workAuthorization');
    const sponsorship = answers.find((answer) => answer.kind === 'sponsorship');

    expect(auth?.value).toBe('');
    expect(sponsorship?.value).toBe('');
  });

  test('a resume that states the status settles both questions', async () => {
    await storage.setProfile({ workStatus: 'U.S. Permanent Resident' });
    const answers = await storage.getAnswers();

    expect(answers.find((answer) => answer.kind === 'workAuthorization')?.value).toBe('Yes');
    expect(answers.find((answer) => answer.kind === 'sponsorship')?.value).toBe('No');
  });

  test('a status that needs sponsorship says so', async () => {
    await storage.setProfile({ workStatus: 'Requires H-1B sponsorship' });
    expect((await storage.getAnswers()).find((answer) => answer.kind === 'sponsorship')?.value).toBe('Yes');
  });

  test('the profile never overwrites an answer the user gave', async () => {
    const seeded = (await storage.getAnswers()).find((answer) => answer.kind === 'workAuthorization')!;
    await storage.upsertAnswer({ id: seeded.id, value: 'No' });
    await storage.setProfile({ workStatus: 'U.S. Citizen' });

    expect((await storage.getAnswers()).find((answer) => answer.kind === 'workAuthorization')?.value).toBe('No');
  });
});
