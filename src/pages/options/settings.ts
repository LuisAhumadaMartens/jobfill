import * as storage from '../../lib/answers/storage.ts';
import { ATS_HOSTS } from '../../lib/sites.ts';
import type { State } from '../../shared/types.ts';
import { $, escapeHtml, flash, put, refreshAll, reload, state } from './shell.ts';

const TOGGLES: Array<{ key: keyof State['settings']; title: string; blurb: string }> = [
  { key: 'showPanel', title: 'Show the JobFill panel on application pages', blurb: 'A small button in the corner, which opens the list of questions found on the page.' },
  { key: 'askToSaveOnSubmit', title: 'Offer to save my answers when I submit an application', blurb: 'Everything you typed by hand becomes an answer JobFill can reuse, and you pick which ones to keep.' },
  { key: 'autofillOnLoad', title: 'Fill automatically when a form loads', blurb: 'Off by default, because most people want to see what will be filled before it happens.' },
  { key: 'autoAttachResume', title: 'Attach my resume file to upload fields', blurb: 'Uses the file you imported on the Resume tab.' },
  { key: 'skipFilledFields', title: 'Never overwrite a field that already has something in it', blurb: 'Keeps anything you or the site typed first.' }
];

export function renderSettings(): void {
  const settings = state().settings;

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
    $('storage-usage').textContent = `${state().answers.length} answers · ${state().stats.filled} fields filled · ~${used} KB stored in this browser.`;
  });
}

export async function onSettingChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const key = input.dataset.setting as keyof State['settings'] | undefined;
  if (!key) return;

  if (input.type === 'range') {
    const fillConfidence = Number(input.value) / 100;
    await storage.setSettings({ fillConfidence, suggestConfidence: Math.max(0.3, fillConfidence - 0.2) });
  } else {
    await storage.setSettings({ [key]: input.checked } as Partial<State['settings']>);
  }
  await reload();
  renderSettings();
  flash();
}

export async function renderGrantedHosts(): Promise<void> {
  const granted = await chrome.permissions.getAll();
  const origins = (granted.origins ?? []).filter((origin) => origin !== '*://*/*');

  $('granted-hosts').innerHTML = origins.length
    ? origins.map((origin) => {
        const host = origin.replace(/^\*:\/\//, '').replace(/\/\*$/, '');
        return `<li>${escapeHtml(host)}<button data-origin="${escapeHtml(origin)}">turn off</button></li>`;
      }).join('')
    : '<li class="plain">None yet. Use “Always run on this site” in the toolbar popup.</li>';
}

export async function exportAnswers(): Promise<void> {
  const payload = await storage.exportAll();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `jobfill-answers-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

export async function importAnswers(file: File): Promise<void> {
  try {
    const payload = JSON.parse(await file.text());
    const { answers } = await storage.importAll(payload, { merge: true });
    await reload();
    await refreshAll();
    flash(`Imported: ${answers} answers now`);
  } catch (error) {
    alert(`Could not import that file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function wireSettings(): void {
  $('settings-form').addEventListener('change', (event) => void onSettingChange(event));

  $('disabled-hosts').addEventListener('click', async (event) => {
    const host = (event.target as HTMLElement).dataset.host;
    if (!host) return;

    await storage.setHostDisabled(host, false);
    await reload();
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

    put(await storage.clearAll());
    await refreshAll();
    flash('Everything erased');
  });
}
