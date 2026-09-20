import * as storage from '../../lib/answers/storage.ts';
import * as schema from '../../lib/answers/schema.ts';
import * as matcher from '../../lib/matching/matcher.ts';
import { readResumeFile, readResumeText, type ParsedResume } from '../../lib/resume/reader.ts';
import { ATS_HOSTS } from '../../lib/sites.ts';
import { toEducationEntries, toWorkEntries } from '../../lib/answers/history.ts';
import { applyImport, planImport, type ImportChange } from '../../lib/answers/import-review.ts';
import * as queue from '../../lib/dex/queue.ts';
import { DEX_ORIGIN, askPermission, hasPermission, sendQueue } from '../../lib/dex/send.ts';
import type { Observation } from '../../shared/dex.ts';
import type { Answer, State } from '../../shared/types.ts';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const TABS = ['resume', 'profile', 'answers', 'contribute', 'settings'] as const;
type Tab = (typeof TABS)[number];

let state: State;
let parsed: ParsedResume | null = null;
let pending: ImportChange[] = [];
let filter = '';
let savedTimer: ReturnType<typeof setTimeout> | null = null;
let waiting: Observation[] = [];
let consent: queue.Consent = { granted: false, askAfterApplying: true, autoSend: true, lastSentAt: null, sentTotal: 0 };

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function flash(message = 'Saved'): void {
  const el = $('saved');
  el.textContent = message;
  el.classList.add('show');
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

function showTab(tab: Tab): void {
  for (const name of TABS) {
    $(`panel-${name}`).hidden = name !== tab;
    document.querySelector(`.tab[data-tab="${name}"]`)?.setAttribute('aria-selected', String(name === tab));
  }
  location.hash = tab;
}

async function handleResume(loader: () => Promise<ParsedResume> | ParsedResume): Promise<void> {
  const target = $('resume-result');
  target.hidden = false;
  target.innerHTML = '<div class="card">Reading...</div>';

  try {
    parsed = await loader();
    pending = planImport(state, {
      profile: parsed.profile,
      history: toWorkEntries(parsed.experience),
      education: toEducationEntries(parsed.education),
      skills: parsed.skills
    });
    renderParsed(parsed, pending);
  } catch (error) {
    parsed = null;
    pending = [];
    target.innerHTML = `<div class="card error">${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
  }
}

function renderParsed(result: ParsedResume, changes: ImportChange[]): void {
  const rows = changes.map((change, index) => `
    <label class="q pick" style="display:flex;gap:9px;align-items:flex-start;padding:9px 0">
      <input type="checkbox" data-change="${index}" checked />
      <span style="flex:1">
        <strong>${escapeHtml(change.label)}</strong>
        <span class="v" style="display:block;max-width:none">
          ${change.before ? `${escapeHtml(change.before)} &rarr; ` : ''}${escapeHtml(change.after || 'added')}
        </span>
      </span>
      <span class="pill">${change.action === 'add' ? 'new' : 'changed'}</span>
    </label>`).join('');

  $('resume-result').innerHTML = `
    <div class="card">
      <h4>${escapeHtml(result.name)}</h4>
      ${changes.length
        ? `<p class="fine" style="margin:0 0 6px">Nothing is saved until you choose. Untick anything you would rather keep as it is.</p>${rows}`
        : '<p class="fine" style="margin:0">Nothing here differs from what JobFill already has.</p>'}
      ${result.warnings.map((warning) => `<p class="note">${escapeHtml(warning)}</p>`).join('')}
    </div>
    <div class="row-actions">
      <button class="primary" id="apply-resume">${changes.length ? 'Save what is ticked' : 'Keep this resume'}</button>
      <button class="ghost" id="discard-resume">Discard</button>
    </div>`;

  $('apply-resume').addEventListener('click', () => void applyParsed());
  $('discard-resume').addEventListener('click', () => {
    parsed = null;
    pending = [];
    $('resume-result').hidden = true;
  });
}

async function applyParsed(): Promise<void> {
  if (!parsed) return;

  const ticked = [...$('resume-result').querySelectorAll<HTMLInputElement>('input[data-change]')]
    .filter((box) => box.checked)
    .map((box) => pending[Number(box.dataset.change)]!)
    .filter(Boolean);

  const applied = applyImport(state, {
    profile: parsed.profile,
    history: toWorkEntries(parsed.experience),
    education: toEducationEntries(parsed.education),
    skills: parsed.skills
  }, ticked);

  await storage.setProfile(applied.profile);
  await storage.setHistory(applied.history);
  await storage.setEducation(applied.education);
  await storage.setSkills(applied.skills);

  await storage.addResume({
    name: parsed.name,
    label: parsed.name.replace(/\.[a-z0-9]+$/i, ''),
    type: parsed.type,
    size: parsed.size,
    dataUrl: parsed.dataUrl,
    text: parsed.text,
    parsedAt: parsed.parsedAt
  });

  state = await storage.load();
  parsed = null;
  pending = [];
  $('resume-result').hidden = true;

  renderProfile();
  renderHistory();
  renderEducation();
  renderSkills();
  renderResumes();
  renderAllRecords();
  renderAnswers();
  flash(ticked.length ? `Saved ${ticked.length} change${ticked.length === 1 ? '' : 's'}` : 'Resume saved');
}

function renderResumes(): void {
  const entries = state.resumes ?? [];

  $('resume-list').innerHTML = entries.length
    ? entries.map((entry) => {
        const isMaster = entry.id === state.masterId;
        const isAttached = entry.id === state.attachmentId;
        return `
        <article class="entry" data-resume="${entry.id}">
          <div class="entry-main">
            <div class="entry-name">
              <input type="text" data-role="label" value="${escapeHtml(entry.label || entry.name)}" aria-label="Name for this resume" />
            </div>
            <div class="entry-meta">
              ${escapeHtml(entry.name)}${entry.size ? ` &middot; ${Math.round(entry.size / 1024)} KB` : ''}${entry.dataUrl ? '' : ' &middot; text only, nothing to attach'}
            </div>
            <div class="roles">
              <button class="role" data-master="1" aria-pressed="${isMaster}" ${isMaster ? 'disabled' : ''}
                      title="Read your details from this one">Details</button>
              <button class="role" data-attach="1" aria-pressed="${isAttached}" ${isAttached || !entry.dataUrl ? 'disabled' : ''}
                      title="${entry.dataUrl ? 'Send this file to employers' : 'Pasted text cannot be attached to an application'}">Attached</button>
            </div>
          </div>
          <div class="entry-actions">
            <button class="danger" data-drop="1">Remove</button>
          </div>
        </article>`;
      }).join('')
    : '<p class="empty">No resumes yet. Drop one above.</p>';
}

function wireResumeInput(): void {
  const drop = $('drop');
  const input = $<HTMLInputElement>('file');

  const choose = () => input.click();
  drop.addEventListener('click', choose);
  drop.addEventListener('keydown', (event) => {
    if ((event as KeyboardEvent).key === 'Enter' || (event as KeyboardEvent).key === ' ') choose();
  });
  $('browse').addEventListener('click', (event) => {
    event.stopPropagation();
    choose();
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) void handleResume(() => readResumeFile(file));
  });

  for (const name of ['dragenter', 'dragover']) {
    drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.add('over');
    });
  }
  for (const name of ['dragleave', 'drop']) {
    drop.addEventListener(name, (event) => {
      event.preventDefault();
      drop.classList.remove('over');
    });
  }
  drop.addEventListener('drop', (event) => {
    const file = (event as DragEvent).dataTransfer?.files?.[0];
    if (file) void handleResume(() => readResumeFile(file));
  });

  $('parse-text').addEventListener('click', () => {
    const text = $<HTMLTextAreaElement>('paste-text').value.trim();
    if (text) void handleResume(() => readResumeText(text));
  });
}

function renderHistory(): void {
  const entries = state.history ?? [];
  $('history').innerHTML = entries.length
    ? entries.map((entry, index) => `
        <article class="entry">
          <div class="entry-main">
            <div class="entry-name">${escapeHtml(entry.title || 'Role')}</div>
            <div class="entry-meta">
              ${escapeHtml(entry.company)}${entry.location ? ` &middot; ${escapeHtml(entry.location)}` : ''}
              ${entry.start ? ` &middot; ${escapeHtml(entry.start)} to ${entry.current ? 'now' : escapeHtml(entry.end || 'unknown')}` : ''}
            </div>
            ${entry.skills.length ? `<div class="aliases entry-tags">${entry.skills.map((skill) => `<span class="alias">${escapeHtml(skill)}</span>`).join('')}</div>` : ''}
          </div>
          <div class="entry-actions">
            <button class="danger" data-remove="${index}">Remove</button>
          </div>
        </article>`).join('')
    : '<p class="empty">No work history yet. Import a resume on the Resume tab.</p>';
}

interface RecordShape<T> {
  id: string;
  fields: Array<{ key: keyof T & string; label: string }>;
  blank: () => T;
  read: () => T[];
  save: (entries: T[]) => Promise<unknown>;
}

function renderRecords<T extends Record<string, string>>(shape: RecordShape<T>): void {
  const entries = shape.read();

  const rows = entries.map((entry, index) => `
    <div class="record" data-index="${index}">
      <div class="row">
        ${shape.fields.map((field) => `
          <input type="text" data-key="${field.key}" placeholder="${escapeHtml(field.label)}"
                 value="${escapeHtml(entry[field.key] ?? '')}" aria-label="${escapeHtml(field.label)}" />`).join('')}
      </div>
      <button data-drop="${index}">Remove</button>
    </div>`).join('');

  $(shape.id).innerHTML = rows + `<button class="add" data-add="1">Add</button>`;
}

function wireRecords<T extends Record<string, string>>(shape: RecordShape<T>): void {
  const container = $(shape.id);

  const collect = (): T[] =>
    [...container.querySelectorAll<HTMLElement>('.record')].map((row) => {
      const entry = shape.blank();
      for (const input of row.querySelectorAll<HTMLInputElement>('input[data-key]')) {
        (entry as Record<string, string>)[input.dataset.key!] = input.value.trim();
      }
      return entry;
    });

  const persist = async (entries: T[]): Promise<void> => {
    await shape.save(entries);
    state = await storage.load();
    renderRecords(shape);
    flash();
  };

  container.addEventListener('change', () => void persist(collect()));

  container.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.dataset.add) {
      void persist([...collect(), shape.blank()]);
      return;
    }
    const drop = target.dataset.drop;
    if (drop !== undefined) {
      void persist(collect().filter((_, index) => index !== Number(drop)));
    }
  });
}

const RECORD_SHAPES = () => [
  {
    id: 'references',
    fields: [
      { key: 'name', label: 'Name' }, { key: 'title', label: 'Title' }, { key: 'company', label: 'Company' },
      { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'relationship', label: 'Relationship' }
    ],
    blank: () => ({ name: '', title: '', company: '', email: '', phone: '', relationship: '' }),
    read: () => state.references ?? [],
    save: (entries: never) => storage.setRecords({ references: entries })
  },
  {
    id: 'languages',
    fields: [{ key: 'language', label: 'Language' }, { key: 'proficiency', label: 'Proficiency' }],
    blank: () => ({ language: '', proficiency: '' }),
    read: () => state.languages ?? [],
    save: (entries: never) => storage.setRecords({ languages: entries })
  },
  {
    id: 'certifications',
    fields: [{ key: 'name', label: 'Certification' }, { key: 'issuer', label: 'Issuer' }, { key: 'date', label: 'Year' }],
    blank: () => ({ name: '', issuer: '', date: '' }),
    read: () => state.certifications ?? [],
    save: (entries: never) => storage.setRecords({ certifications: entries })
  },
  {
    id: 'skillYears',
    fields: [{ key: 'name', label: 'Skill' }, { key: 'years', label: 'Years' }],
    blank: () => ({ name: '', years: '' }),
    read: () => state.skillYears ?? [],
    save: (entries: never) => storage.setRecords({ skillYears: entries })
  }
] as unknown as Array<RecordShape<Record<string, string>>>;

function renderAllRecords(): void {
  for (const shape of RECORD_SHAPES()) renderRecords(shape);
}

function renderEducation(): void {
  const entries = state.education ?? [];
  $('education').innerHTML = entries.length
    ? entries.map((entry, index) => `
        <article class="entry">
          <div class="entry-main">
            <div class="entry-name">${escapeHtml(entry.school || 'School')}</div>
            <div class="entry-meta">
              ${escapeHtml([entry.degree, entry.field].filter(Boolean).join(', '))}
              ${entry.end ? ` &middot; ${escapeHtml(entry.end)}` : ''}
              ${entry.gpa ? ` &middot; GPA ${escapeHtml(entry.gpa)}` : ''}
            </div>
          </div>
          <div class="entry-actions">
            <button class="danger" data-remove-education="${index}">Remove</button>
          </div>
        </article>`).join('')
    : '<p class="empty">No education yet. Import a resume on the Resume tab.</p>';
}

const OUTCOMES: Record<string, string> = {
  unmatched: 'nothing matched',
  unsure: 'matched, but not confidently',
  'no-option': 'no option fitted the answer',
  cleared: 'the page cleared what was filled',
  replaced: 'the page replaced what was filled'
};

async function renderContribute(): Promise<void> {
  waiting = await queue.readQueue();
  consent = await queue.readConsent();

  $('dex-gate').textContent = consent.granted
    ? 'Sharing is on. Questions go as they are found, and a question stays private until five separate reports have seen it and a person has approved it.'
    : 'Nothing has left this browser yet. Sending once grants the network permission, and after that questions go on their own.';

  $('dex-queue').innerHTML = waiting.length
    ? waiting.map((observation, index) => `
        <article class="entry">
          <div class="entry-main">
            <div class="dex-q">${escapeHtml(observation.question)}</div>
            <div class="entry-meta">
              ${escapeHtml(observation.ats)} &middot; ${escapeHtml(observation.control)} &middot; ${escapeHtml(OUTCOMES[observation.outcome] ?? observation.outcome)}
            </div>
            ${observation.options.length ? `<div class="dex-opts">${observation.options.map(escapeHtml).join(' &middot; ')}</div>` : ''}
          </div>
          <div class="entry-actions">
            <button class="danger" data-forget="${index}">Forget</button>
          </div>
        </article>`).join('')
    : `<p class="empty">${consent.granted
        ? 'Nothing waiting. Questions are shared as they are found, so this stays empty unless one could not be sent.'
        : 'Nothing waiting. JobFill adds a question here when it cannot answer one on a job board.'}</p>`;

  $('dex-send').textContent = consent.granted ? 'Send now' : 'Review and send';
  $<HTMLButtonElement>('dex-send').disabled = !waiting.length;
  $<HTMLButtonElement>('dex-copy').disabled = !waiting.length;
  $<HTMLButtonElement>('dex-clear').disabled = !waiting.length;

  $('dex-settings').innerHTML = `
    <label class="setting">
      <input type="checkbox" id="dex-collect" ${consent.askAfterApplying ? 'checked' : ''} />
      <span class="text">
        <strong>Keep questions JobFill could not answer</strong>
        <span>Held in this browser and shown above.</span>
      </span>
    </label>
    <label class="setting">
      <input type="checkbox" id="dex-auto" ${consent.autoSend ? 'checked' : ''} />
      <span class="text">
        <strong>Share them as they are found</strong>
        <span>${consent.granted
          ? 'A question is sent as soon as it is collected. Turn this off and nothing leaves again.'
          : 'Press Review and send once to let the browser grant network access. After that it happens on its own.'}</span>
      </span>
    </label>`;

  const sent = consent.sentTotal;
  const last = consent.lastSentAt ? new Date(consent.lastSentAt) : null;

  $('dex-status').textContent = sent
    ? `${sent} question${sent === 1 ? '' : 's'} shared from this browser, the last at ${last?.toLocaleString() ?? 'an unknown time'}.`
    : 'Nothing has been shared from this browser yet.';
}

async function sendContributions(): Promise<void> {
  const origin = DEX_ORIGIN;

  if (!(await hasPermission(origin))) {
    const granted = await askPermission(origin);
    if (!granted) {
      flash('Not sent');
      return;
    }
    await queue.writeConsent({ granted: true });
  }

  flash('Sending...');
  const result = await sendQueue(origin, chrome.runtime.getManifest().version);
  await renderContribute();

  if (result.sent) flash(`Sent ${result.sent}`);
  else flash(result.refused[0] ?? 'Nothing sent');
}

function wireContribute(): void {
  $('dex-queue').addEventListener('click', async (event) => {
    const index = (event.target as HTMLElement).dataset.forget;
    if (index === undefined) return;
    const observation = waiting[Number(index)];
    if (observation) await queue.drop(observation.question, observation.ats);
    await renderContribute();
    flash('Forgotten');
  });

  $('dex-send').addEventListener('click', () => void sendContributions());

  $('dex-copy').addEventListener('click', async () => {
    await navigator.clipboard.writeText(JSON.stringify(waiting, null, 2));
    flash('Copied');
  });

  $('dex-clear').addEventListener('click', async () => {
    await queue.clearQueue();
    await renderContribute();
    flash('Discarded');
  });

  $('dex-settings').addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;

    if (input.id === 'dex-collect') await queue.writeConsent({ askAfterApplying: input.checked });
    else if (input.id === 'dex-auto') await queue.writeConsent({ autoSend: input.checked });
    else return;

    await renderContribute();
    flash();
  });
}

function renderSkills(): void {
  $<HTMLTextAreaElement>('skills').value = (state.skills ?? []).join(', ');
}

function renderProfile(): void {
  $('profile-form').innerHTML = schema.PROFILE_FIELDS.map((field) => {
    const wide = field.key === 'addressLine1' || field.key === 'website';
    const type = field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'phone' ? 'tel' : 'text';
    return `
      <div class="field${wide ? ' wide' : ''}">
        <label for="p-${field.key}">${escapeHtml(field.label)}</label>
        <input type="${type}" id="p-${field.key}" name="${field.key}" value="${escapeHtml(state.profile[field.key] ?? '')}" />
      </div>`;
  }).join('');
}

async function saveProfile(): Promise<void> {
  const form = $<HTMLFormElement>('profile-form');
  const update: Record<string, string> = {};
  for (const field of schema.PROFILE_FIELDS) {
    const input = form.elements.namedItem(field.key) as HTMLInputElement | null;
    update[field.key] = input?.value.trim() ?? '';
  }
  await storage.setProfile(update);
  state = await storage.load();
  renderAnswers();
  flash('Profile saved');
}

function answerEditor(answer: Answer): string {
  const isProfile = answer.source === 'profile';
  const valueField = answer.type === 'longtext'
    ? `<textarea rows="4" data-role="value">${escapeHtml(answer.value)}</textarea>`
    : answer.choices?.length
      ? `<select data-role="value">
           ${answer.choices.map((choice) => `<option ${choice === answer.value ? 'selected' : ''}>${escapeHtml(choice)}</option>`).join('')}
           ${answer.choices.includes(answer.value) || !answer.value ? '' : `<option selected>${escapeHtml(answer.value)}</option>`}
         </select>`
      : `<input type="text" data-role="value" value="${escapeHtml(answer.value)}" />`;

  const aliases = answer.aliases.length
    ? answer.aliases.map((alias, index) => `
        <span class="alias">${escapeHtml(alias)}
          <button data-act="drop-alias" data-index="${index}" title="Forget this wording" aria-label="Forget this wording">
            <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
          </button>
        </span>`).join('')
    : '<span class="alias" style="opacity:.6">No extra wordings learnt yet</span>';

  return `
    <details class="answer" data-id="${answer.id}">
      <summary>
        <span class="q">${escapeHtml(answer.question)}</span>
        <span class="v">${escapeHtml(answer.value) || '<em>no answer yet</em>'}</span>
        ${answer.scope !== 'global' ? `<span class="pill">${escapeHtml(answer.scope.replace(/^site:/, ''))}</span>` : ''}
        ${answer.kind ? `<span class="pill">${escapeHtml(answer.kind)}</span>` : ''}
        ${answer.usageCount ? `<span class="pill">used ${answer.usageCount} time${answer.usageCount === 1 ? '' : 's'}</span>` : ''}
      </summary>
      <div class="body">
        <div>
          <label>Question</label>
          <input type="text" data-role="question" value="${escapeHtml(answer.question)}" ${isProfile ? 'readonly' : ''} />
        </div>
        <div>
          <label>Answer</label>
          ${valueField}
          ${answer.notes ? `<p class="fine" style="margin-top:6px">${escapeHtml(answer.notes)}</p>` : ''}
        </div>
        <div>
          <label>Note to self</label>
          <input type="text" data-role="notes" value="${escapeHtml(answer.notes)}" placeholder="Only you see this" />
        </div>
        <div>
          <label>Where this applies</label>
          <input type="text" data-role="scope" value="${escapeHtml(answer.scope === 'global' ? '' : answer.scope.replace(/^site:/, ''))}"
                 placeholder="Every site. Type a hostname to use it on that site only." />
        </div>
        <div>
          <label>Also recognised as ${answer.aliases.length ? `(${answer.aliases.length})` : ''}</label>
          <div class="aliases">${aliases}</div>
        </div>
        <div>
          <label>Add a wording</label>
          <input type="text" data-role="new-alias" placeholder="e.g. Do you need visa sponsorship now or in the future?" />
        </div>
        <div class="actions">
          ${isProfile ? '<span class="fine">Comes from your profile. Edit it on the Profile tab.</span>' : '<button class="danger" data-act="delete">Delete</button>'}
          <button class="primary" data-act="save">Save</button>
        </div>
      </div>
    </details>`;
}

function renderAnswers(): void {
  const list = filter ? matcher.search(filter, state.answers, 200) : state.answers;
  const sorted = list.slice().sort((a, b) => {
    if (!a.value !== !b.value) return a.value ? 1 : -1;
    return a.question.localeCompare(b.question);
  });

  $('answer-list').innerHTML = sorted.length
    ? sorted.map(answerEditor).join('') + `<p class="count">${sorted.length} of ${state.answers.length} answers</p>`
    : '<p class="empty">Nothing matches that search.</p>';
}

async function onAnswerClick(event: Event): Promise<void> {
  const button = (event.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement | null;
  if (!button) return;
  const card = button.closest('.answer') as HTMLDetailsElement;
  const id = card.dataset.id!;
  const answer = state.answers.find((a) => a.id === id);
  if (!answer) return;

  const pick = <T extends HTMLElement>(role: string) => card.querySelector<T>(`[data-role="${role}"]`);

  switch (button.dataset.act) {
    case 'save': {
      const question = pick<HTMLInputElement>('question')?.value.trim() || answer.question;
      const value = (pick<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('value')?.value ?? '').trim();
      const newAlias = pick<HTMLInputElement>('new-alias')?.value.trim();
      const notes = pick<HTMLInputElement>('notes')?.value.trim() ?? answer.notes;
      const host = pick<HTMLInputElement>('scope')?.value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
      const scope = host ? `site:${host}` : 'global';

      await storage.upsertAnswer({ id, question, value, notes, scope });
      if (newAlias) await storage.addAlias(id, newAlias);

      if (answer.source === 'profile' && answer.kind) await storage.setProfile({ [answer.kind]: value });

      state = await storage.load();
      renderAnswers();
      renderProfile();
      flash();
      break;
    }
    case 'delete': {
      if (!confirm(`Delete “${answer.question}”?`)) return;
      await storage.deleteAnswer(id);
      state = await storage.load();
      renderAnswers();
      flash('Deleted');
      break;
    }
    case 'drop-alias': {
      const index = Number(button.dataset.index);
      const aliases = answer.aliases.filter((_, i) => i !== index);
      await storage.upsertAnswer({ id, aliases });
      state = await storage.load();
      renderAnswers();
      flash();
      break;
    }
    default: break;
  }
}

async function newAnswer(): Promise<void> {
  const question = prompt('What question should JobFill recognise?');
  if (!question?.trim()) return;
  const value = prompt(`Your answer to “${question.trim()}”:`) ?? '';
  await storage.upsertAnswer({ question: question.trim(), value: value.trim(), source: 'user' });
  state = await storage.load();
  filter = '';
  $<HTMLInputElement>('answer-search').value = '';
  renderAnswers();
  flash('Answer added');
}

const TOGGLES: Array<{ key: keyof State['settings']; title: string; blurb: string }> = [
  { key: 'showPanel', title: 'Show the JobFill panel on application pages', blurb: 'A small button in the corner, which opens the list of questions found on the page.' },
  { key: 'askToSaveOnSubmit', title: 'Offer to save my answers when I submit an application', blurb: 'Everything you typed by hand becomes an answer JobFill can reuse, and you pick which ones to keep.' },
  { key: 'autofillOnLoad', title: 'Fill automatically when a form loads', blurb: 'Off by default, because most people want to see what will be filled before it happens.' },
  { key: 'autoAttachResume', title: 'Attach my resume file to upload fields', blurb: 'Uses the file you imported on the Resume tab.' },
  { key: 'skipFilledFields', title: 'Never overwrite a field that already has something in it', blurb: 'Keeps anything you or the site typed first.' }
];

function renderSettings(): void {
  const settings = state.settings;

  $('settings-form').innerHTML = TOGGLES.map((toggle) => `
    <label class="setting">
      <input type="checkbox" data-setting="${toggle.key}" ${settings[toggle.key] ? 'checked' : ''} />
      <span class="text"><strong>${escapeHtml(toggle.title)}</strong><span>${escapeHtml(toggle.blurb)}</span></span>
    </label>`).join('') + `
    <div class="setting">
      <span class="text" style="flex:1">
        <strong>How sure JobFill must be before it fills a field</strong>
        <span>Lower fills more and guesses more. Currently ${Math.round(settings.fillConfidence * 100)}%.</span>
      </span>
      <input type="range" min="40" max="95" step="5" value="${Math.round(settings.fillConfidence * 100)}" data-setting="fillConfidence" />
    </div>`;

  $('disabled-hosts').innerHTML = settings.disabledHosts.length
    ? settings.disabledHosts.map((host) => `<li>${escapeHtml(host)}<button data-host="${escapeHtml(host)}">unmute</button></li>`).join('')
    : '<li class="plain">Nothing muted.</li>';

  $('builtin-summary').textContent = `Supported job boards (${ATS_HOSTS.length})`;
  $('builtin-hosts').innerHTML = ATS_HOSTS.map((host) => `<li class="plain">${escapeHtml(host)}</li>`).join('');

  void renderGrantedHosts();

  void navigator.storage?.estimate?.().then((estimate) => {
    const used = estimate.usage ? (estimate.usage / 1024).toFixed(0) : '0';
    $('storage-usage').textContent = `${state.answers.length} answers · ${state.stats.filled} fields filled · ~${used} KB stored in this browser.`;
  });
}

async function onSettingChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const key = input.dataset.setting as keyof State['settings'] | undefined;
  if (!key) return;

  if (input.type === 'range') {
    const fillConfidence = Number(input.value) / 100;
    await storage.setSettings({ fillConfidence, suggestConfidence: Math.max(0.3, fillConfidence - 0.2) });
  } else {
    await storage.setSettings({ [key]: input.checked } as Partial<State['settings']>);
  }
  state = await storage.load();
  renderSettings();
  flash();
}

async function renderGrantedHosts(): Promise<void> {
  const granted = await chrome.permissions.getAll();
  const origins = (granted.origins ?? []).filter((origin) => origin !== '*://*/*');

  $('granted-hosts').innerHTML = origins.length
    ? origins.map((origin) => {
        const host = origin.replace(/^\*:\/\//, '').replace(/\/\*$/, '');
        return `<li>${escapeHtml(host)}<button data-origin="${escapeHtml(origin)}">turn off</button></li>`;
      }).join('')
    : '<li class="plain">None yet. Use “Always run on this site” in the toolbar popup.</li>';
}

async function exportAnswers(): Promise<void> {
  const payload = await storage.exportAll();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `jobfill-answers-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

async function importAnswers(file: File): Promise<void> {
  try {
    const payload = JSON.parse(await file.text());
    const { answers } = await storage.importAll(payload, { merge: true });
    state = await storage.load();
    renderAnswers();
    renderProfile();
    renderSettings();
    flash(`Imported: ${answers} answers now`);
  } catch (error) {
    alert(`Could not import that file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function boot(): Promise<void> {
  state = await storage.load();

  wireResumeInput();
  renderProfile();
  renderHistory();
  renderEducation();
  renderSkills();
  renderResumes();
  renderAllRecords();
  for (const shape of RECORD_SHAPES()) wireRecords(shape);
  renderAnswers();
  renderSettings();
  wireContribute();
  await renderContribute();

  $('tabs').addEventListener('click', (event) => {
    const tab = (event.target as HTMLElement).closest('.tab') as HTMLElement | null;
    if (tab?.dataset.tab) showTab(tab.dataset.tab as Tab);
  });

  $('save-profile').addEventListener('click', () => void saveProfile());

  $('resume-list').addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const card = input.closest('[data-resume]') as HTMLElement | null;
    if (!card || input.dataset.role !== 'label') return;
    await storage.updateResume(card.dataset.resume!, { label: input.value.trim() });
    state = await storage.load();
    flash();
  });

  $('resume-list').addEventListener('click', async (event) => {
    const button = event.target as HTMLElement;
    const card = button.closest('[data-resume]') as HTMLElement | null;
    if (!card) return;
    const id = card.dataset.resume!;

    if (button.dataset.master) await storage.setResumeRoles({ masterId: id });
    else if (button.dataset.attach) await storage.setResumeRoles({ attachmentId: id });
    else if (button.dataset.drop) await storage.removeResume(id);
    else return;

    state = await storage.load();
    renderResumes();
    flash();
  });

  $('history').addEventListener('click', async (event) => {
    const index = (event.target as HTMLElement).dataset.remove;
    if (index === undefined) return;
    await storage.setHistory((state.history ?? []).filter((_, position) => position !== Number(index)));
    state = await storage.load();
    renderHistory();
    flash('Removed');
  });
  $('new-answer').addEventListener('click', () => void newAnswer());
  $('answer-list').addEventListener('click', (event) => void onAnswerClick(event));
  $('answer-search').addEventListener('input', (event) => {
    filter = (event.target as HTMLInputElement).value.trim();
    renderAnswers();
  });

  $('settings-form').addEventListener('change', (event) => void onSettingChange(event));
  $('disabled-hosts').addEventListener('click', async (event) => {
    const host = (event.target as HTMLElement).dataset.host;
    if (!host) return;
    await storage.setHostDisabled(host, false);
    state = await storage.load();
    renderSettings();
  });

  $('granted-hosts').addEventListener('click', async (event) => {
    const origin = (event.target as HTMLElement).dataset.origin;
    if (!origin) return;
    await chrome.permissions.remove({ origins: [origin] });
    await chrome.runtime.sendMessage({ kind: 'site-permission-changed' }).catch(() => undefined);
    await renderGrantedHosts();
    flash('Turned off');
  });

  $('export').addEventListener('click', () => void exportAnswers());
  $('import').addEventListener('click', () => $<HTMLInputElement>('import-file').click());
  $('import-file').addEventListener('change', (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) void importAnswers(file);
  });
  $('reset').addEventListener('click', async () => {
    if (!confirm('Erase every answer, your profile and the stored resume? This cannot be undone.')) return;
    state = await storage.clearAll();
    renderProfile();
    renderAnswers();
    renderSettings();
    flash('Everything erased');
  });

  const requested = location.hash.replace('#', '') as Tab;
  showTab(TABS.includes(requested) ? requested : (state.resumes.length ? 'answers' : 'resume'));
}

void boot();
