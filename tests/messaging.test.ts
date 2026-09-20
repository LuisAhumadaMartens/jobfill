import { describe, expect, test } from 'bun:test';
import { resolveTabId } from '../src/shared/messages.ts';
import type { ToBackground } from '../src/shared/messages.ts';

describe('working out which tab a message is about', () => {
  test('a content script is identified by the tab it runs in', () => {
    expect(resolveTabId({ kind: 'get-tab-state' }, 42)).toBe(42);
  });

  test('the popup is not a tab, so it has to say which tab it means', () => {
    expect(resolveTabId({ kind: 'get-tab-state', tabId: 7 }, undefined)).toBe(7);
  });

  test('a popup that says nothing resolves to nothing, which is the bug that hid the counts', () => {
    expect(resolveTabId({ kind: 'get-tab-state' }, undefined)).toBeNull();
  });

  test('what the message says wins over where it came from', () => {
    expect(resolveTabId({ kind: 'fill-all', tabId: 7 }, 42)).toBe(7);
  });

  test('every message the popup sends can carry a tab', () => {
    const fromPopup: ToBackground[] = [
      { kind: 'get-tab-state', tabId: 1 },
      { kind: 'activate', tabId: 1 },
      { kind: 'fill-all', tabId: 1 },
      { kind: 'toggle-panel', tabId: 1 },
      { kind: 'rescan', tabId: 1 },
      { kind: 'fill-one', frameId: 0, uid: 'a', tabId: 1 },
      { kind: 'reveal', frameId: 0, uid: 'a', tabId: 1 },
      { kind: 'save-answer', frameId: 0, uid: 'a', value: 'x', tabId: 1 }
    ];

    for (const message of fromPopup) {
      expect({ kind: message.kind, tab: resolveTabId(message, undefined) })
        .toEqual({ kind: message.kind, tab: 1 });
    }
  });
});

describe('the popup actually passes it', () => {
  test('no tab-scoped send in the popup is missing its tabId', async () => {
    const source = await Bun.file('src/pages/popup/popup.ts').text();
    const sends = [...source.matchAll(/send(?:<[^>]*>)?\(\{[\s\S]*?\}\)/g)].map((match) => match[0]);

    const tabFree = ['open-options', 'site-permission-changed'];
    const offenders = sends
      .filter((call) => !tabFree.some((kind) => call.includes(kind)))
      .filter((call) => !call.includes('tabId'));

    expect(offenders).toEqual([]);
  });
});
