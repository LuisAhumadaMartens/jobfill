import type { FieldPlan } from './types.ts';

export interface FrameReport {
  frameId: number;
  url: string;
  isApplication: boolean;
  plans: FieldPlan[];
  scannedAt: number;
}

export interface TabSnapshot {
  tabId: number;
  host: string;
  frames: FrameReport[];
  counts: { total: number; filled: number; ready: number; suggest: number; unknown: number };
}

export type ToBackground =
  | { kind: 'report'; url: string; isApplication: boolean; plans: FieldPlan[] }

  | { kind: 'site-permission-changed' }

  | { kind: 'activate'; tabId?: number }
  | { kind: 'get-tab-state'; tabId?: number }
  | { kind: 'fill-all'; tabId?: number }
  | { kind: 'fill-one'; frameId: number; uid: string; answerId?: string; value?: string; tabId?: number }
  | { kind: 'reveal'; frameId: number; uid: string; tabId?: number }
  | { kind: 'save-answer'; frameId: number; uid: string; value: string; answerId?: string; fill?: boolean; tabId?: number }
  | { kind: 'rescan'; tabId?: number }
  | { kind: 'toggle-panel'; tabId?: number }
  | { kind: 'open-options' };

export type ToContent =
  | { kind: 'ping' }

  | { kind: 'activate' }

  | { kind: 'panel-role'; owns: boolean }
  | { kind: 'rescan' }
  | { kind: 'fill-all' }
  | { kind: 'fill-one'; uid: string; answerId?: string; value?: string }
  | { kind: 'reveal'; uid: string }
  | { kind: 'save-answer'; uid: string; value: string; answerId?: string; fill?: boolean }
  | { kind: 'toggle-panel' }
  | { kind: 'tab-updated'; snapshot: TabSnapshot };

export interface ReportAck {
  ok: boolean;

  ownsPanel: boolean;

  frameId: number;
}

export interface FillSummary {
  filled: number;
  failed: number;
  skipped: number;
  notes: string[];
}

export async function send<T = unknown>(message: ToBackground): Promise<T | null> {
  try {
    return (await chrome.runtime.sendMessage(message)) as T;
  } catch {
    return null;
  }
}

export async function sendToTab<T = unknown>(tabId: number, message: ToContent, frameId?: number): Promise<T | null> {
  try {
    const response = frameId === undefined
      ? await chrome.tabs.sendMessage(tabId, message)
      : await chrome.tabs.sendMessage(tabId, message, { frameId });
    return response as T;
  } catch {
    return null;
  }
}
