import { REPORT_SCHEMA, LIMITS, type Observation, type Report } from '../../shared/dex.ts';
import { batches, readConsent, readQueue, writeConsent, writeQueue } from './queue.ts';

export const DEX_ORIGIN = 'https://dex.jobfill.app';

export interface SendResult {
  sent: number;
  kept: number;
  refused: string[];
}

function token(): string {
  return crypto.randomUUID().replace(/-/g, '');
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function reportFor(observations: Observation[], version: string): Report {
  return { schema: REPORT_SCHEMA, session: token(), day: today(), version, observations };
}

export async function hasPermission(origin: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [`${origin}/*`] });
}

export async function askPermission(origin: string): Promise<boolean> {
  return chrome.permissions.request({ origins: [`${origin}/*`] });
}

export async function send(origin: string, observations: Observation[], version: string): Promise<SendResult> {
  const result: SendResult = { sent: 0, kept: 0, refused: [] };

  for (const batch of batches(observations.slice(0, LIMITS.observations * 8))) {
    const response = await fetch(`${origin}/v1/reports`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(reportFor(batch, version))
    }).catch(() => null);

    if (!response) {
      result.kept += batch.length;
      result.refused.push('could not reach the question bank');
      break;
    }

    if (response.status === 202) {
      result.sent += batch.length;
      continue;
    }

    result.kept += batch.length;
    const body = await response.json().catch(() => ({ error: `refused with ${response.status}` }));
    result.refused.push(String((body as { error?: string }).error ?? response.status));
  }

  return result;
}

export async function sendQueue(origin: string, version: string): Promise<SendResult> {
  const queue = await readQueue();
  if (!queue.length) return { sent: 0, kept: 0, refused: [] };

  const result = await send(origin, queue, version);
  await writeQueue(queue.slice(result.sent));

  if (result.sent) {
    const consent = await readConsent();
    await writeConsent({ lastSentAt: new Date().toISOString(), sentTotal: consent.sentTotal + result.sent });
  }

  return result;
}
