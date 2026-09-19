import { send } from '../../shared/messages.ts';
import type { TabSnapshot } from '../../shared/messages.ts';
import * as storage from '../../lib/answers/storage.ts';
import { isKnownATS, originPatternFor } from '../../lib/sites.ts';
import type { FieldPlan } from '../../shared/types.ts';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

type SiteMode = 'builtin' | 'granted' | 'ask';

let snapshot: TabSnapshot | null = null;
let host = '';
let origin = '';
let mode: SiteMode = 'ask';
let muted = false;

function escapeHtml(value: string): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function setStatus(text: string): void {
  $('status').textContent = text;
}

function allPlans(): FieldPlan[] {
  return snapshot ? snapshot.frames.flatMap((frame) => frame.plans) : [];
}

async function currentTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function readSite(): Promise<void> {
  const tab = await currentTab();
  if (!tab?.url || !/^https?:/.test(tab.url)) {
    host = '';
    return;
  }
  host = new URL(tab.url).hostname;
  origin = originPatternFor(host);

  if (isKnownATS(host)) mode = 'builtin';
  else mode = (await chrome.permissions.contains({ origins: [origin] })) ? 'granted' : 'ask';

  muted = await storage.isHostDisabled(host);
}

function renderSiteControls(): void {
  const always = $<HTMLInputElement>('always');
  const wrapper = document.querySelector('.always') as HTMLElement;
  const mute = $<HTMLButtonElement>('mute');

  if (mode === 'builtin') {
    wrapper.classList.add('locked');
    $('always-title').textContent = 'Runs here automatically';
    $('always-note').textContent = `${host} is a job site JobFill supports out of the box.`;
    mute.hidden = false;
    mute.textContent = muted ? 'Unmute this site' : 'Mute this site';
    return;
  }

  wrapper.classList.remove('locked');
  always.checked = mode === 'granted';
  $('always-title').textContent = `Always run on ${host}`;
  $('always-note').textContent = mode === 'granted'
    ? 'Turn this off to make JobFill forget this site.'
    : 'Chrome will ask once. JobFill then starts here on its own.';
  mute.hidden = mode !== 'granted';
  mute.textContent = muted ? 'Unmute this site' : 'Mute this site';
}

function renderCounts(): void {
  const counts = snapshot?.counts;
  const primary = $<HTMLButtonElement>('primary');

  if (!counts || !counts.total) {
    $('counts').hidden = true;
    $('quick').innerHTML = '';
    $('panel').hidden = true;

    if (mode === 'ask') {
      primary.hidden = false;
      primary.disabled = false;
      primary.textContent = 'Run JobFill here';
      setStatus(`JobFill is not running on ${host || 'this page'}.`);
    } else {
      primary.hidden = false;
      primary.disabled = false;
      primary.textContent = 'Scan this page';
      setStatus(muted ? 'Muted on this site.' : 'No application questions found yet.');
    }
    return;
  }

  $('counts').hidden = false;
  $('panel').hidden = false;
  $('count-ready').textContent = String(counts.ready);
  $('count-review').textContent = String(counts.suggest + counts.unknown);
  $('count-filled').textContent = String(counts.filled);

  primary.hidden = false;
  primary.disabled = counts.ready === 0;
  primary.textContent = counts.ready ? `Fill ${counts.ready} field${counts.ready === 1 ? '' : 's'}` : 'Nothing ready to fill';

  setStatus(counts.unknown
    ? `${counts.unknown} question${counts.unknown === 1 ? '' : 's'} JobFill has not learnt yet.`
    : 'Every question on this page has an answer.');

  renderQuick();
}

function renderQuick(): void {
  const unknown = allPlans()
    .filter((plan) => plan.status === 'unknown' && plan.field.control !== 'file')
    .slice(0, 4);

  $('quick').innerHTML = unknown.map((plan) => `
    <li data-frame="${plan.frameId}" data-uid="${plan.field.uid}">
      <div class="q">${escapeHtml(plan.field.label)}</div>
      <div class="row">
        <input type="text" placeholder="Answer once, reuse everywhere" />
        <button data-act="save">Save</button>
      </div>
    </li>`).join('');
}

async function refresh(): Promise<void> {
  snapshot = await send<TabSnapshot>({ kind: 'get-tab-state' });
  $('host').textContent = host || 'this page';
  renderSiteControls();
  renderCounts();
  await renderPendingReview();
}

async function renderPendingReview(): Promise<void> {
  if (!host) return;
  const review = await storage.getPendingReview(host);
  if (!review) return;

  const panel = $<HTMLButtonElement>('panel');
  panel.hidden = false;
  panel.textContent = `Save ${review.items.length}`;
  setStatus(`You applied here. ${review.items.length} answer${review.items.length === 1 ? '' : 's'} to keep.`);
}

async function activate(): Promise<void> {
  setStatus('Starting…');
  const result = await send<{ ok: boolean; reason?: string }>({ kind: 'activate' });
  if (!result?.ok) {
    setStatus(result?.reason ?? 'Chrome will not let extensions run on this page.');
    return;
  }
  await refresh();
}

async function onPrimary(): Promise<void> {
  const counts = snapshot?.counts;
  if (counts?.ready) {
    setStatus('Filling…');
    await send({ kind: 'fill-all' });
    await refresh();
    return;
  }
  await activate();
}

async function onAlwaysToggled(): Promise<void> {
  const always = $<HTMLInputElement>('always');
  if (mode === 'builtin') return;

  if (always.checked) {

    const granted = await chrome.permissions.request({ origins: [origin] });
    if (!granted) {
      always.checked = false;
      setStatus('Chrome declined. JobFill will not run here automatically.');
      return;
    }
    mode = 'granted';
    await send({ kind: 'site-permission-changed' });
    await activate();
  } else {
    await chrome.permissions.remove({ origins: [origin] });
    mode = 'ask';
    await send({ kind: 'site-permission-changed' });
  }
  await refresh();
}

$('primary').addEventListener('click', () => void onPrimary());
$('always').addEventListener('change', () => void onAlwaysToggled());

$('panel').addEventListener('click', async () => {
  await send({ kind: 'toggle-panel' });
  window.close();
});

$('options').addEventListener('click', () => {
  void chrome.runtime.openOptionsPage();
  window.close();
});

$('mute').addEventListener('click', async () => {
  if (!host) return;
  muted = !muted;
  await storage.setHostDisabled(host, muted);
  await refresh();
});

$('quick').addEventListener('click', async (event) => {
  const button = (event.target as HTMLElement).closest('button[data-act="save"]');
  if (!button) return;

  const item = button.closest('li') as HTMLLIElement;
  const input = item.querySelector('input') as HTMLInputElement;
  const value = input.value.trim();
  if (!value) {
    input.focus();
    return;
  }

  await send({
    kind: 'save-answer',
    frameId: Number(item.dataset.frame),
    uid: String(item.dataset.uid),
    value,
    fill: true
  });
  item.remove();
  await refresh();
});

await readSite();
await refresh();
