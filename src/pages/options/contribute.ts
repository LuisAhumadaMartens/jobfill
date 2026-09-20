import * as queue from '../../lib/dex/queue.ts';
import { DEX_ORIGIN, askPermission, hasPermission, sendQueue } from '../../lib/dex/send.ts';
import type { Observation } from '../../shared/dex.ts';
import { $, escapeHtml, flash } from './shell.ts';

let waiting: Observation[] = [];
let consent: queue.Consent = { collect: true, autoSend: true, lastSentAt: null, sentTotal: 0 };
let allowed = false;

const OUTCOMES: Record<string, string> = {
  unmatched: 'nothing matched',
  unsure: 'matched, but not confidently',
  'no-option': 'no option fitted the answer',
  cleared: 'the page cleared what was filled',
  replaced: 'the page replaced what was filled'
};

export async function renderContribute(): Promise<void> {
  waiting = await queue.readQueue();
  consent = await queue.readConsent();
  allowed = await hasPermission(DEX_ORIGIN);

  $('dex-gate').textContent = allowed
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
    : `<p class="empty">${allowed
        ? 'Nothing waiting. Questions are shared as they are found, so this stays empty unless one could not be sent.'
        : 'Nothing waiting. JobFill adds a question here when it cannot answer one on a job board.'}</p>`;

  $('dex-send').textContent = allowed ? 'Send now' : 'Review and send';
  $<HTMLButtonElement>('dex-send').disabled = !waiting.length;
  $<HTMLButtonElement>('dex-copy').disabled = !waiting.length;
  $<HTMLButtonElement>('dex-clear').disabled = !waiting.length;

  $('dex-settings').innerHTML = `
    <label class="setting">
      <input type="checkbox" id="dex-collect" ${consent.collect ? 'checked' : ''} />
      <span class="text">
        <strong>Keep questions JobFill could not answer</strong>
        <span>Held in this browser and shown above.</span>
      </span>
    </label>
    <label class="setting">
      <input type="checkbox" id="dex-auto" ${consent.autoSend ? 'checked' : ''} />
      <span class="text">
        <strong>Share them as they are found</strong>
        <span>${allowed
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
    if (!(await askPermission(origin))) {
      flash('Not sent');
      return;
    }
  }

  flash('Sending...');
  const result = await sendQueue(origin, chrome.runtime.getManifest().version);
  await renderContribute();

  if (result.sent) flash(`Sent ${result.sent}`);
  else flash(result.refused[0] ?? 'Nothing sent');
}

export function wireContribute(): void {
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

    if (input.id === 'dex-collect') await queue.writeConsent({ collect: input.checked });
    else if (input.id === 'dex-auto') await queue.writeConsent({ autoSend: input.checked });
    else return;

    await renderContribute();
    flash();
  });
}
