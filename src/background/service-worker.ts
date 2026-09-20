import * as storage from '../lib/answers/storage.ts';
import { resolveTabId, sendToTab } from '../shared/messages.ts';
import { BADGE_ATTENTION, BADGE_READY, CONTENT_SCRIPT } from '../shared/paths.ts';
import type { FrameReport, ReportAck, TabSnapshot, ToBackground, ToContent } from '../shared/messages.ts';
import { observationsFor } from '../lib/dex/collect.ts';
import { dueToSend, enqueue, readConsent } from '../lib/dex/queue.ts';
import { DEX_ORIGIN, hasPermission, sendQueue } from '../lib/dex/send.ts';
import { load } from '../lib/answers/storage.ts';
import type { FieldPlan } from '../shared/types.ts';

const MENU_FILL = 'jobfill-fill-page';

const OPT_IN_SCRIPT = 'jobfill-opt-in';

const tabs = new Map<number, Map<number, FrameReport>>();

const panelOwners = new Map<number, number>();

async function syncOptInScripts(): Promise<void> {
  const granted = await chrome.permissions.getAll();
  const origins = (granted.origins ?? []).filter((origin) => origin !== '*://*/*');

  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [OPT_IN_SCRIPT] }).catch(() => []);
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [OPT_IN_SCRIPT] });
  if (!origins.length) return;

  try {
    await chrome.scripting.registerContentScripts([{
      id: OPT_IN_SCRIPT,
      matches: origins,
      js: [CONTENT_SCRIPT],
      runAt: 'document_idle',
      allFrames: true
    }]);
  } catch (error) {

    console.warn('JobFill: could not register opt-in scripts', error);
  }
}

function panelOwnerOf(tabId: number): number {
  const frames = [...framesOf(tabId).values()];
  if (!frames.length) return 0;

  const top = frames.find((frame) => frame.frameId === 0);
  const applications = frames.filter((frame) => frame.isApplication).sort((a, b) => a.frameId - b.frameId);

  if (top?.isApplication) return 0;
  if (applications.length) return applications[0]!.frameId;
  return top ? 0 : frames[0]!.frameId;
}

async function syncPanelOwner(tabId: number): Promise<number> {
  const owner = panelOwnerOf(tabId);
  const previous = panelOwners.get(tabId);
  if (previous === owner) return owner;

  panelOwners.set(tabId, owner);
  if (previous !== undefined) await sendToTab(tabId, { kind: 'panel-role', owns: false }, previous);
  await sendToTab(tabId, { kind: 'panel-role', owns: true }, owner);
  return owner;
}

async function collect(url: string, plans: FieldPlan[]): Promise<void> {
  if (!plans.length) return;

  const consent = await readConsent();
  if (!consent.askAfterApplying) return;

  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return;
  }

  const { profile } = await load();
  const added = await enqueue(observationsFor(plans, host, profile));

  if (!dueToSend(consent, added)) return;
  if (!(await hasPermission(DEX_ORIGIN))) return;

  await sendQueue(DEX_ORIGIN, chrome.runtime.getManifest().version);
}

function framesOf(tabId: number): Map<number, FrameReport> {
  let frames = tabs.get(tabId);
  if (!frames) {
    frames = new Map();
    tabs.set(tabId, frames);
  }
  return frames;
}

function snapshot(tabId: number, host = ''): TabSnapshot {
  const frames = [...framesOf(tabId).values()].sort((a, b) => a.frameId - b.frameId);
  const plans = frames.flatMap((frame) => frame.plans);
  const count = (status: FieldPlan['status']) => plans.filter((plan) => plan.status === status).length;

  return {
    tabId,
    host,
    frames,
    counts: {
      total: plans.length,
      filled: count('filled'),
      ready: count('ready'),
      suggest: count('suggest'),
      unknown: count('unknown')
    }
  };
}

async function paintBadge(tabId: number): Promise<void> {
  const { counts } = snapshot(tabId);
  const pending = counts.ready;
  const text = pending > 0 ? String(pending) : counts.unknown > 0 ? '?' : '';
  await chrome.action.setBadgeText({ tabId, text });
  await chrome.action.setBadgeBackgroundColor({ tabId, color: pending > 0 ? BADGE_READY : BADGE_ATTENTION });
}

async function activeTabId(): Promise<number | null> {
  const [focused] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (focused?.id !== undefined) return focused.id;

  const [current] = await chrome.tabs.query({ active: true, currentWindow: true });
  return current?.id ?? null;
}

async function broadcast(tabId: number, message: ToContent): Promise<unknown[]> {
  const frames = [...framesOf(tabId).keys()];
  const targets = frames.length ? frames : [0];
  const results = await Promise.all(targets.map((frameId) => sendToTab(tabId, message, frameId)));
  return results.filter((result) => result != null);
}

chrome.runtime.onMessage.addListener((message: ToBackground, sender, sendResponse) => {
  const reply = async (): Promise<unknown> => {
    if (message.kind === 'open-options') {
      await chrome.runtime.openOptionsPage();
      return { ok: true };
    }

    if (message.kind === 'site-permission-changed') {
      await syncOptInScripts();
      return { ok: true };
    }

    const tabId = resolveTabId(message, sender.tab?.id) ?? await activeTabId();
    if (!tabId) return { ok: false, reason: 'no tab' };

    switch (message.kind) {
      case 'report': {
        const frameId = sender.frameId ?? 0;
        framesOf(tabId).set(frameId, {
          frameId,
          url: message.url,
          isApplication: message.isApplication,
          plans: message.plans.map((plan) => ({ ...plan, frameId })),
          scannedAt: Date.now()
        });
        await paintBadge(tabId);
        await collect(message.url, message.plans);
        const owner = await syncPanelOwner(tabId);

        if (frameId !== owner) {
          await sendToTab(tabId, { kind: 'tab-updated', snapshot: snapshot(tabId) }, owner);
        }
        return { ok: true, ownsPanel: frameId === owner, frameId } satisfies ReportAck;
      }

      case 'get-tab-state': {
        let host = '';
        try {
          const tab = await chrome.tabs.get(tabId);
          host = tab.url ? new URL(tab.url).hostname : '';
        } catch {  }
        return snapshot(tabId, host);
      }

      case 'fill-all':
        return { results: await broadcast(tabId, { kind: 'fill-all' }) };

      case 'rescan':
        return { results: await broadcast(tabId, { kind: 'rescan' }) };

      case 'toggle-panel':
        return await sendToTab(tabId, { kind: 'toggle-panel' }, panelOwners.get(tabId) ?? 0);

      case 'activate': {

        const alive = await sendToTab(tabId, { kind: 'ping' }, 0);
        if (!alive) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId, allFrames: true },
              files: [CONTENT_SCRIPT]
            });
          } catch (error) {
            return { ok: false, reason: error instanceof Error ? error.message : 'could not run here' };
          }
        }
        await broadcast(tabId, { kind: 'activate' });
        return { ok: true };
      }

      case 'fill-one':
        return await sendToTab(tabId, { kind: 'fill-one', uid: message.uid, answerId: message.answerId, value: message.value }, message.frameId);

      case 'reveal':
        return await sendToTab(tabId, { kind: 'reveal', uid: message.uid }, message.frameId);

      case 'save-answer':
        return await sendToTab(tabId, {
          kind: 'save-answer',
          uid: message.uid,
          value: message.value,
          answerId: message.answerId,
          fill: message.fill
        }, message.frameId);

      default:
        return { ok: false, reason: 'unknown message' };
    }
  };

  void reply().then(sendResponse);
  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  const tabId = await activeTabId();
  if (!tabId) return;
  if (command === 'fill-page') await broadcast(tabId, { kind: 'fill-all' });
  if (command === 'toggle-panel') await sendToTab(tabId, { kind: 'toggle-panel' }, 0);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabs.delete(tabId);
  panelOwners.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {

  if (changeInfo.status === 'loading' && changeInfo.url) {
    tabs.delete(tabId);
    panelOwners.delete(tabId);
  }
});

chrome.permissions.onAdded.addListener(() => void syncOptInScripts());
chrome.permissions.onRemoved.addListener(() => void syncOptInScripts());
chrome.runtime.onStartup.addListener(() => void syncOptInScripts());

chrome.runtime.onInstalled.addListener(async (details) => {

  await storage.load();
  await syncOptInScripts();

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_FILL,
      title: 'Fill this application with JobFill',
      contexts: ['page', 'editable']
    });
  });

  if (details.reason === 'install') await chrome.runtime.openOptionsPage();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== MENU_FILL || !tab?.id) return;

  const alive = await sendToTab(tab.id, { kind: 'ping' }, 0);
  if (!alive) {
    await chrome.scripting
      .executeScript({ target: { tabId: tab.id, allFrames: true }, files: [CONTENT_SCRIPT] })
      .catch(() => undefined);
  }
  await broadcast(tab.id, { kind: 'fill-all' });
});
