import * as storage from '../../lib/answers/storage.ts';
import * as schema from '../../lib/answers/schema.ts';
import * as matcher from '../../lib/matching/matcher.ts';
import type { Answer } from '../../shared/types.ts';
import { $, escapeHtml, flash, put, reload, state } from './shell.ts';
import { renderProfile } from './profile.ts';

let filter = '';

export function setFilter(value: string): void {
  filter = value;
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

export function renderAnswers(): void {
  const list = filter ? matcher.search(filter, state().answers, 200) : state().answers;
  const sorted = list.slice().sort((a, b) => {
    if (!a.value !== !b.value) return a.value ? 1 : -1;
    return a.question.localeCompare(b.question);
  });

  $('answer-list').innerHTML = sorted.length
    ? sorted.map(answerEditor).join('') + `<p class="count">${sorted.length} of ${state().answers.length} answers</p>`
    : '<p class="empty">Nothing matches that search.</p>';
}

export async function onAnswerClick(event: Event): Promise<void> {
  const button = (event.target as HTMLElement).closest('button[data-act]') as HTMLButtonElement | null;
  if (!button) return;
  const card = button.closest('.answer') as HTMLDetailsElement;
  const id = card.dataset.id!;
  const answer = state().answers.find((a) => a.id === id);
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

      await reload();
      renderAnswers();
      renderProfile();
      flash();
      break;
    }
    case 'delete': {
      if (!confirm(`Delete “${answer.question}”?`)) return;
      await storage.deleteAnswer(id);
      await reload();
      renderAnswers();
      flash('Deleted');
      break;
    }
    case 'drop-alias': {
      const index = Number(button.dataset.index);
      const aliases = answer.aliases.filter((_, i) => i !== index);
      await storage.upsertAnswer({ id, aliases });
      await reload();
      renderAnswers();
      flash();
      break;
    }
    default: break;
  }
}

export async function newAnswer(): Promise<void> {
  const question = prompt('What question should JobFill recognise?');
  if (!question?.trim()) return;
  const value = prompt(`Your answer to “${question.trim()}”:`) ?? '';
  await storage.upsertAnswer({ question: question.trim(), value: value.trim(), source: 'user' });
  await reload();
  filter = '';
  $<HTMLInputElement>('answer-search').value = '';
  renderAnswers();
  flash('Answer added');
}

export function wireAnswers(): void {
  $('new-answer').addEventListener('click', () => void newAnswer());
  $('answer-list').addEventListener('click', (event) => void onAnswerClick(event));
  $('answer-search').addEventListener('input', (event) => {
    setFilter((event.target as HTMLInputElement).value.trim());
    renderAnswers();
  });
}
