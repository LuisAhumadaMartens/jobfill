import * as storage from '../../lib/answers/storage.ts';
import * as schema from '../../lib/answers/schema.ts';
import { $, escapeHtml, flash, put, reload, state } from './shell.ts';
import { renderAnswers } from './answers.ts';

export function renderProfile(): void {
  $('profile-form').innerHTML = schema.PROFILE_FIELDS.map((field) => {
    const wide = field.key === 'addressLine1' || field.key === 'website';
    const type = field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : field.type === 'phone' ? 'tel' : 'text';
    return `
      <div class="field${wide ? ' wide' : ''}">
        <label for="p-${field.key}">${escapeHtml(field.label)}</label>
        <input type="${type}" id="p-${field.key}" name="${field.key}" value="${escapeHtml(state().profile[field.key] ?? '')}" />
      </div>`;
  }).join('');
}

export async function saveProfile(): Promise<void> {
  const form = $<HTMLFormElement>('profile-form');
  const update: Record<string, string> = {};
  for (const field of schema.PROFILE_FIELDS) {
    const input = form.elements.namedItem(field.key) as HTMLInputElement | null;
    update[field.key] = input?.value.trim() ?? '';
  }
  await storage.setProfile(update);
  await reload();
  renderAnswers();
  flash('Profile saved');
}

export function wireProfile(): void {
  $('save-profile').addEventListener('click', () => void saveProfile());
}
