import * as storage from '../../lib/answers/storage.ts';
import type { State } from '../../shared/types.ts';

export const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let savedTimer: ReturnType<typeof setTimeout> | null = null;

export function flash(message = 'Saved'): void {
  const el = $('saved');
  el.textContent = message;
  el.classList.add('show');
  if (savedTimer) clearTimeout(savedTimer);
  savedTimer = setTimeout(() => el.classList.remove('show'), 2000);
}

let current: State;

export function state(): State {
  return current;
}

export function put(next: State): void {
  current = next;
}

export async function reload(): Promise<State> {
  current = await storage.load();
  return current;
}

type Renderer = () => void | Promise<void>;

const renderers: Renderer[] = [];

export function onRefresh(renderer: Renderer): void {
  renderers.push(renderer);
}

export async function refreshAll(): Promise<void> {
  for (const renderer of renderers) {
    try {
      await renderer();
    } catch (error) {
      console.error('JobFill could not render a section', error);
    }
  }
}
