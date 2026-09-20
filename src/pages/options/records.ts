import * as storage from '../../lib/answers/storage.ts';
import { $, escapeHtml, flash, put, reload, state } from './shell.ts';

export function renderHistory(): void {
  const entries = state().history ?? [];
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

export function wireRecords<T extends Record<string, string>>(shape: RecordShape<T>): void {
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
    await reload();
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

export const RECORD_SHAPES = () => [
  {
    id: 'references',
    fields: [
      { key: 'name', label: 'Name' }, { key: 'title', label: 'Title' }, { key: 'company', label: 'Company' },
      { key: 'email', label: 'Email' }, { key: 'phone', label: 'Phone' }, { key: 'relationship', label: 'Relationship' }
    ],
    blank: () => ({ name: '', title: '', company: '', email: '', phone: '', relationship: '' }),
    read: () => state().references ?? [],
    save: (entries: never) => storage.setRecords({ references: entries })
  },
  {
    id: 'languages',
    fields: [{ key: 'language', label: 'Language' }, { key: 'proficiency', label: 'Proficiency' }],
    blank: () => ({ language: '', proficiency: '' }),
    read: () => state().languages ?? [],
    save: (entries: never) => storage.setRecords({ languages: entries })
  },
  {
    id: 'certifications',
    fields: [{ key: 'name', label: 'Certification' }, { key: 'issuer', label: 'Issuer' }, { key: 'date', label: 'Year' }],
    blank: () => ({ name: '', issuer: '', date: '' }),
    read: () => state().certifications ?? [],
    save: (entries: never) => storage.setRecords({ certifications: entries })
  },
  {
    id: 'skillYears',
    fields: [{ key: 'name', label: 'Skill' }, { key: 'years', label: 'Years' }],
    blank: () => ({ name: '', years: '' }),
    read: () => state().skillYears ?? [],
    save: (entries: never) => storage.setRecords({ skillYears: entries })
  }
] as unknown as Array<RecordShape<Record<string, string>>>;

export function renderAllRecords(): void {
  for (const shape of RECORD_SHAPES()) renderRecords(shape);
}

export function renderEducation(): void {
  const entries = state().education ?? [];
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

export function renderSkills(): void {
  $<HTMLTextAreaElement>('skills').value = (state().skills ?? []).join(', ');
}

export function wireRecordLists(): void {
  for (const shape of RECORD_SHAPES()) wireRecords(shape);

  $('history').addEventListener('click', async (event) => {
    const index = (event.target as HTMLElement).dataset.remove;
    if (index === undefined) return;

    await storage.setHistory((state().history ?? []).filter((_, position) => position !== Number(index)));
    await reload();
    renderHistory();
    flash('Removed');
  });
}
