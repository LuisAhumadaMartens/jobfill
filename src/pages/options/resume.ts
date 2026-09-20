import * as storage from '../../lib/answers/storage.ts';
import { readResumeFile, readResumeText, type ParsedResume } from '../../lib/resume/reader.ts';
import { applyImport, planImport, type ImportChange } from '../../lib/answers/import-review.ts';
import { toEducationEntries, toWorkEntries } from '../../lib/answers/history.ts';
import { $, escapeHtml, flash, put, refreshAll, reload, state } from './shell.ts';

let parsed: ParsedResume | null = null;

let pending: ImportChange[] = [];

async function handleResume(loader: () => Promise<ParsedResume> | ParsedResume): Promise<void> {
  const target = $('resume-result');
  target.hidden = false;
  target.innerHTML = '<div class="card">Reading...</div>';

  try {
    parsed = await loader();
    pending = planImport(state(), {
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

  const applied = applyImport(state(), {
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

  await reload();
  parsed = null;
  pending = [];
  $('resume-result').hidden = true;

  await refreshAll();
  flash(ticked.length ? `Saved ${ticked.length} change${ticked.length === 1 ? '' : 's'}` : 'Resume saved');
}

export function renderResumes(): void {
  const entries = state().resumes ?? [];

  $('resume-list').innerHTML = entries.length
    ? entries.map((entry) => {
        const isMaster = entry.id === state().masterId;
        const isAttached = entry.id === state().attachmentId;
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

export function wireResumeInput(): void {
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

export function wireResumes(): void {
  $('resume-list').addEventListener('change', async (event) => {
    const input = event.target as HTMLInputElement;
    const card = input.closest('[data-resume]') as HTMLElement | null;
    if (!card || input.dataset.role !== 'label') return;

    await storage.updateResume(card.dataset.resume!, { label: input.value.trim() });
    await reload();
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

    await reload();
    renderResumes();
    flash();
  });
}
