import { area } from '../answers/storage.ts';
import { LIMITS, type Observation } from '../../shared/atlas.ts';

const KEY = 'atlasQueue';
const CONSENT = 'atlasConsent';

export const QUEUE_CAP = 200;

export interface Consent {
  granted: boolean;
  askAfterApplying: boolean;
  lastSentAt: string | null;
  sentTotal: number;
}

const BLANK: Consent = { granted: false, askAfterApplying: true, lastSentAt: null, sentTotal: 0 };

function keyOf(observation: Observation): string {
  return `${observation.ats}|${observation.question.toLowerCase()}|${observation.outcome}`;
}

export async function readQueue(): Promise<Observation[]> {
  const stored = await area.get([KEY]);
  const queue = stored[KEY];
  return Array.isArray(queue) ? (queue as Observation[]) : [];
}

export async function writeQueue(queue: Observation[]): Promise<void> {
  await area.set({ [KEY]: queue.slice(-QUEUE_CAP) });
}

export function merge(queue: Observation[], incoming: Observation[]): Observation[] {
  const seen = new Set(queue.map(keyOf));
  const added = incoming.filter((observation) => {
    const key = keyOf(observation);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...queue, ...added].slice(-QUEUE_CAP);
}

export async function enqueue(incoming: Observation[]): Promise<number> {
  if (!incoming.length) return 0;
  const queue = await readQueue();
  const merged = merge(queue, incoming);
  await writeQueue(merged);
  return merged.length - queue.length;
}

export async function drop(question: string, ats: string): Promise<void> {
  const queue = await readQueue();
  await writeQueue(queue.filter((observation) => !(observation.question === question && observation.ats === ats)));
}

export async function clearQueue(): Promise<void> {
  await area.remove(KEY);
}

export function batches(queue: Observation[]): Observation[][] {
  const chunks: Observation[][] = [];
  for (let index = 0; index < queue.length; index += LIMITS.observations) {
    chunks.push(queue.slice(index, index + LIMITS.observations));
  }
  return chunks;
}

export async function readConsent(): Promise<Consent> {
  const stored = await area.get([CONSENT]);
  const consent = stored[CONSENT];
  return consent && typeof consent === 'object' ? { ...BLANK, ...(consent as Consent) } : { ...BLANK };
}

export async function writeConsent(patch: Partial<Consent>): Promise<Consent> {
  const next = { ...(await readConsent()), ...patch };
  await area.set({ [CONSENT]: next });
  return next;
}
