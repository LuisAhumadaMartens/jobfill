import * as storage from '../lib/answers/storage.ts';
import * as matcher from '../lib/matching/matcher.ts';
import * as T from '../lib/matching/text.ts';
import * as places from '../lib/matching/places.ts';
import { answerTypeFor as typeForField, buildReviewItems } from '../lib/answers/review.ts';
import { valueFromRecords } from '../lib/answers/history.ts';
import { fillTemplate, pageContextFrom } from '../lib/values/template.ts';
import { verifyValue, verdictNote, verdictSummary } from '../lib/matching/verify.ts';
import * as scanner from './scanner.ts';
import * as filler from './filler.ts';
import { Panel } from './panel.ts';
import { send } from '../shared/messages.ts';
import type { FillSummary, ReportAck, TabSnapshot, ToBackground, ToContent } from '../shared/messages.ts';
import type { Answer, FieldPlan, PendingReview, ScannedField, State } from '../shared/types.ts';

const RESUME_ANSWER = '__resume__';

declare global {

  var __jobfillLoaded: boolean | undefined;
}
if (globalThis.__jobfillLoaded) throw new Error('JobFill already running in this frame');
globalThis.__jobfillLoaded = true;

const host = location.hostname;

let ownsPanel = window.top === window;

let myFrameId = window.top === window ? 0 : -1;

let invokedByUser = false;

let state: State | null = null;
let fields = new Map<string, ScannedField>();
let plans: FieldPlan[] = [];
let panel: Panel | null = null;
let dismissed = false;

const attempted = new Map<string, { value: string; ok: boolean }>();

let undoable: Array<{ uid: string; previous: string }> = [];
let rescanTimer: ReturnType<typeof setTimeout> | null = null;

const SALARY_KINDS = new Set(['compensation', 'salaryMin', 'salaryMax']);

const BASED_HERE = /\b(based in|located in|live in|living in|reside in|residing in|currently in)\b/i;
const WOULD_MOVE = /\b(relocat|move to|willing to move)\b/i;

function deriveFromLocation(field: ScannedField, current: State): { value: string; note: string; certain: boolean } | null {
  const label = field.label;
  const asksWhereYouAre = BASED_HERE.test(label);
  if (!asksWhereYouAre && !WOULD_MOVE.test(label)) return null;

  const target = places.questionPlace(label);
  const home = places.homeOf(current.profile);
  if (!places.isHome(home, target)) return null;

  return {
    value: 'Yes',
    note: `You are in ${home!.raw}, which is in ${target!.name}.`,
    certain: asksWhereYouAre
  };
}

function planFor(field: ScannedField, current: State): FieldPlan {

  field.currentValue = scanner.readValue(field);
  const existing = field.currentValue;
  const base = { field: scanner.serialize(field), frameId: myFrameId } as FieldPlan;

  if (field.control === 'file') {
    const wantsResume = field.kind === 'resumeFile' || /resume|cv/i.test(field.name + field.label);
    if (existing) return { ...base, status: 'filled', value: existing };
    const attachment = storage.attachmentOf(current);
    if (wantsResume && attachment?.dataUrl && current.settings.autoAttachResume) {
      return { ...base, status: 'ready', answerId: RESUME_ANSWER, value: attachment.name, reason: 'saved resume' };
    }
    return { ...base, status: 'unknown', note: 'Upload a resume in JobFill’s options to attach it automatically.' };
  }

  if (existing && current.settings.skipFilledFields) {
    return { ...base, status: 'filled', value: existing };
  }

  const tried = attempted.get(field.uid);
  if (tried?.ok) return { ...base, status: 'filled', value: tried.value };
  if (tried) {
    return {
      ...base,
      status: 'suggest',
      value: tried.value,
      note: 'Filled once and the page did not keep it. Try again, or set it by hand.'
    };
  }

  const result = matcher.best(field, current.answers, {
    host,
    fillConfidence: current.settings.fillConfidence,
    suggestConfidence: current.settings.suggestConfidence
  });

  const candidates = result.candidates.map((c) => ({
    id: c.answer.id,
    question: c.answer.question,
    value: c.answer.value,
    score: c.score
  }));

  const fromRecords = valueFromRecords(field, current);
  if (fromRecords && !existing) {
    return { ...base, status: 'ready', value: fromRecords, reason: 'history' };
  }

  const derived = deriveFromLocation(field, current);

  if (result.status === 'none' || !result.match) {
    if (derived) {
      return { ...base, status: derived.certain ? 'ready' : 'suggest', value: derived.value, note: derived.note, reason: 'location' };
    }
    return { ...base, status: 'unknown', candidates };
  }

  const { answer, score, reason } = result.match;

  const wantsHourly = /\b(hourly|per hour|an hour|hourly rate)\b/i.test(field.label);
  const looksAnnual = Number(String(answer.value).replace(/[^\d.]/g, '')) >= 1000;
  if (wantsHourly && looksAnnual && SALARY_KINDS.has(answer.kind ?? '')) {
    return {
      ...base,
      status: 'suggest',
      answerId: answer.id,
      value: answer.value,
      note: 'This field asks for an hourly rate and the saved figure looks annual.'
    };
  }

  if (!answer.value) {

    if (derived) {
      return { ...base, status: derived.certain ? 'ready' : 'suggest', value: derived.value, note: derived.note, reason: 'location' };
    }
    return {
      ...base,
      status: 'unknown',
      answerId: answer.id,
      candidates,
      note: `Matches “${answer.question}”, which has no answer saved yet.`
    };
  }

  return {
    ...base,
    status: result.status === 'fill' ? 'ready' : 'suggest',
    answerId: answer.id,
    value: answer.value,
    score,
    reason,
    candidates
  };
}

async function refresh(options: { rescan?: boolean } = {}): Promise<void> {
  state = await storage.load();
  if ((state.settings.disabledHosts ?? []).some((h) => host === h || host.endsWith('.' + h))) {
    panel?.unmount();
    return;
  }

  if (options.rescan !== false) {
    const found = scanner.scan();
    fields = new Map(found.map((field) => [field.uid, field]));
    plans = found.map((field) => planFor(field, state!));
  } else {
    plans = [...fields.values()].map((field) => planFor(field, state!));
  }

  await publish();
  if (state.settings.autofillOnLoad && scanner.looksLikeApplication([...fields.values()]) && plans.some((p) => p.status === 'ready')) {
    await fillAll();
  }
}

async function publish(): Promise<void> {
  if (!state) return;
  const isApplication = scanner.looksLikeApplication([...fields.values()]) || invokedByUser;

  const ack = await send<ReportAck>({ kind: 'report', url: location.href, isApplication, plans });
  if (ack) {
    ownsPanel = ack.ownsPanel;
    if (ack.frameId !== myFrameId) {
      myFrameId = ack.frameId;
      for (const plan of plans) plan.frameId = myFrameId;
    }
  }

  if (ownsPanel) updatePanel(isApplication);
  else panel?.unmount();
}

function updatePanel(isApplication: boolean): void {
  if (!state) return;
  const worthShowing = invokedByUser
    || panel?.hasReview
    || (state.settings.showPanel && !dismissed && (isApplication || plans.length >= 3));

  if (!worthShowing) {
    panel?.unmount();
    return;
  }

  if (!panel) {
    panel = new Panel({
      onFillAll: () => void fillAll(),
      onFillOne: (plan) => void route(plan, () => fillOne(plan.field.uid, plan.answerId, plan.value),
        { kind: 'fill-one', frameId: plan.frameId, uid: plan.field.uid, answerId: plan.answerId, value: plan.value }),
      onSave: (plan, value, answerId) => void route(plan, () => saveAnswer(plan.field.uid, value, answerId),
        { kind: 'save-answer', frameId: plan.frameId, uid: plan.field.uid, value, answerId }),
      onReveal: (plan) => void route(plan, () => reveal(plan.field.uid),
        { kind: 'reveal', frameId: plan.frameId, uid: plan.field.uid }),
      onRescan: () => void refresh(),
      onUndo: () => void undoFill(),
      onCorner: (corner) => void storage.setSettings({ panelCorner: corner }),
      onSaveReview: (uids) => void saveReview(uids),
      onDismissReview: () => void dismissReview(),
      onOpenOptions: () => void send({ kind: 'open-options' }),
      onDismiss: () => {
        dismissed = true;
        panel?.unmount();
      }
    });
    filler.injectHighlightStyles();
  }

  panel.mount();
  panel.setCorner(state.settings.panelCorner);
  panel.update(plans, state.answers);
}

const DIAL_CODE = /^\s*\+\d/;

function countryControlFor(phone: ScannedField): ScannedField | undefined {
  const candidates = [...fields.values()].filter((field) => {
    if (field.uid === phone.uid) return false;
    if (field.control !== 'select' && field.control !== 'combobox') return false;
    if (field.kind === 'country') return true;
    return field.options.some((option) => DIAL_CODE.test(option.text) || DIAL_CODE.test(option.value));
  });

  const before = candidates.filter((field) => {
    const position = field.el.compareDocumentPosition(phone.el);
    return (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
  });

  const form = (phone.el as HTMLInputElement).form;
  const sameForm = before.filter((field) => !form || (field.el as HTMLInputElement).form === form);
  const pool = sameForm.length ? sameForm : before;
  return pool[pool.length - 1];
}

function planOf(uid: string): FieldPlan | undefined {
  return plans.find((plan) => plan.field.uid === uid);
}

async function route(plan: FieldPlan, local: () => Promise<unknown> | unknown, remote: ToBackground): Promise<void> {
  if (plan.frameId === myFrameId) {
    await local();
    await refresh({ rescan: false });
    return;
  }
  await send(remote);
  const snapshot = await send<TabSnapshot>({ kind: 'get-tab-state' });
  if (snapshot && panel && state) panel.update(mergeFrames(snapshot.frames), state.answers);
}

async function fillOne(uid: string, answerId?: string, value?: string): Promise<boolean> {
  attempted.delete(uid);
  const field = fields.get(uid);
  const plan = planOf(uid);
  if (!field || !state || !plan) return false;

  const attachment = storage.attachmentOf(state);
  if (answerId === RESUME_ANSWER || (field.control === 'file' && attachment)) {
    if (!attachment) return false;
    const outcome = await filler.attachFile(field, attachment);
    plan.status = outcome.ok ? 'filled' : 'failed';
    plan.note = outcome.reason;
    plan.value = outcome.applied;
    return outcome.ok;
  }

  const answer = state.answers.find((a) => a.id === (answerId ?? plan.answerId));
  const text = value ?? answer?.value ?? '';
  const written = fillTemplate(text, pageContextFrom(document.title, host));
  const isPhone = answer?.type === 'phone' || field.kind === 'phone' || field.type === 'tel';
  const outcome = await filler.fillField(field, written, answer, isPhone
    ? { countryField: countryControlFor(field), country: state.profile.country }
    : {});
  attempted.set(uid, { value: outcome.applied ?? text, ok: outcome.ok });

  plan.status = outcome.ok ? 'filled' : 'failed';
  plan.value = outcome.applied ?? text;
  plan.note = outcome.reason;

  if (outcome.ok && answer) {
    await storage.recordUse(answer.id);

    if (outcome.applied && answer.type === 'choice') {
      await storage.addValueAlias(answer.id, answer.value, outcome.applied);
    }
  }
  return outcome.ok;
}

async function verifyFilled(summary: FillSummary): Promise<void> {

  await new Promise((resolve) => setTimeout(resolve, 400));

  for (const plan of plans) {
    if (plan.status !== 'filled' || !attempted.has(plan.field.uid)) continue;
    const field = fields.get(plan.field.uid);
    if (!field || !field.el.isConnected) continue;

    const current = T.squish(scanner.readValue(field));
    const verdict = verifyValue({
      control: field.control,
      expected: plan.value ?? '',
      current,
      answer: state?.answers.find((a) => a.id === plan.answerId)
    });

    if (verdict === 'held' || verdict === 'unreadable') continue;

    plan.status = 'failed';
    plan.note = verdictNote(verdict, current);
    if (verdict === 'replaced') plan.value = current;
    summary.filled = Math.max(0, summary.filled - 1);
    summary.failed++;
    summary.notes.push(`${plan.field.label}: ${verdictSummary(verdict)}`);
  }
}

async function fillAll(): Promise<FillSummary> {
  const summary: FillSummary = { filled: 0, failed: 0, skipped: 0, notes: [] };
  panel?.setBusy(true, 'Filling…');

  undoable = plans
    .filter((plan) => plan.status === 'ready')
    .map((plan) => ({ uid: plan.field.uid, previous: fields.get(plan.field.uid) ? scanner.readValue(fields.get(plan.field.uid)!) : '' }));

  for (const plan of plans.filter((p) => p.status === 'ready')) {
    const ok = await fillOne(plan.field.uid, plan.answerId, plan.value);
    if (ok) summary.filled++;
    else {
      summary.failed++;
      if (plan.note) summary.notes.push(`${plan.field.label}: ${plan.note}`);
    }
  }

  panel?.setBusy(true, 'Checking what stuck…');
  await verifyFilled(summary);

  panel?.setBusy(false, summary.failed
    ? `Filled ${summary.filled}, ${summary.failed} need you`
    : summary.filled ? `Filled ${summary.filled} field${summary.filled === 1 ? '' : 's'}` : '');
  panel?.setUndoable(summary.filled > 0);
  if (state) {
    await storage.patch({ stats: { ...state.stats, applications: state.stats.applications + (summary.filled ? 1 : 0) } });
    state = await storage.load();
  }
  await publish();
  return summary;
}

async function saveAnswer(uid: string, value: string, answerId?: string): Promise<void> {
  const field = fields.get(uid);
  if (!field || !state) return;
  const question = field.label || field.placeholder || field.name;

  let answer: Answer | null | undefined;

  if (answerId) {
    answer = state.answers.find((a) => a.id === answerId) ?? null;
    if (answer) {
      await storage.addAlias(answer.id, question);
      if (value && value !== answer.value) {
        answer = await storage.upsertAnswer({ id: answer.id, value });
      }
    }
  }

  if (!answer) {
    answer = await storage.upsertAnswer({
      question,
      value,
      kind: field.kind,
      type: typeForField(scanner.serialize(field)),
      choices: field.options.length ? field.options.map((opt) => opt.text).filter(Boolean) : undefined,
      source: 'user'
    });
  }

  state = await storage.load();
  const plan = planOf(uid);
  if (plan) {
    plan.answerId = answer.id;
    plan.value = answer.value;
  }

  await fillOne(uid, answer.id, answer.value);
  await refresh({ rescan: false });
}

async function captureForReview(): Promise<void> {
  if (!state?.settings.askToSaveOnSubmit) return;

  const entries = [...fields.values()].map((field) => ({
    field: scanner.serialize(field),
    value: scanner.readValue(field)
  }));

  const items = buildReviewItems(entries, state.answers, host);
  if (!items.length) return;

  const review: PendingReview = {
    host,
    url: location.href,
    title: document.title,
    capturedAt: new Date().toISOString(),
    items
  };

  await storage.setPendingReview(review);

  if (ownsPanel) showReview(review);
}

const SUBMIT_WORDS = /\b(submit|apply now|apply for|send application|finish|complete application)\b/i;

function watchForSubmit(): void {
  document.addEventListener('submit', () => void captureForReview(), true);

  document.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest('button, input[type="submit"], [role="button"]') as HTMLElement | null;
    if (!button) return;

    const label = T.squish(button.textContent || (button as HTMLInputElement).value || button.getAttribute('aria-label') || '');
    const isSubmit = (button as HTMLButtonElement).type === 'submit' || SUBMIT_WORDS.test(label);
    if (!isSubmit) return;

    setTimeout(() => void captureForReview(), 250);
  }, true);
}

async function saveReview(uids: string[]): Promise<void> {
  const review = await storage.getPendingReview(host);
  if (!review) {
    panel?.setReview(null);
    return;
  }

  const keep = review.items.filter((item) => uids.includes(item.uid));
  const tally = await storage.applyReview(keep);

  state = await storage.load();
  invokedByUser = false;
  panel?.setReview(null);
  panel?.setBusy(false, `Saved ${tally.created + tally.updated} answer${tally.created + tally.updated === 1 ? '' : 's'}`);
  await refresh({ rescan: false });
}

async function dismissReview(): Promise<void> {
  await storage.setPendingReview(null);
  invokedByUser = false;
  panel?.setReview(null);
}

function showReview(review: PendingReview): void {
  invokedByUser = true;
  dismissed = false;
  if (!panel) updatePanel(true);
  panel?.mount();
  panel?.setReview(review);
}

async function offerPendingReview(): Promise<void> {
  if (!ownsPanel || !state?.settings.askToSaveOnSubmit) return;
  const review = await storage.getPendingReview(host);
  if (review) showReview(review);
}

async function undoFill(): Promise<void> {
  let restored = 0;

  for (const { uid, previous } of undoable) {
    const field = fields.get(uid);
    if (!field || !field.el.isConnected) continue;
    filler.restoreValue(field, previous);
    attempted.delete(uid);
    restored++;
  }

  undoable = [];
  panel?.setUndoable(false);
  await refresh({ rescan: false });
  panel?.setBusy(false, restored ? `Put ${restored} field${restored === 1 ? '' : 's'} back` : 'Nothing to undo');
}

function reveal(uid: string): void {
  const field = fields.get(uid);
  if (field) filler.scrollTo(field);
}

chrome.runtime.onMessage.addListener((message: ToContent, _sender, sendResponse) => {
  switch (message.kind) {
    case 'ping':
      sendResponse({ ok: true, host });
      return false;

    case 'activate':

      invokedByUser = true;
      dismissed = false;
      void refresh().then(() => {
        if (ownsPanel) panel?.setOpen(true);
        sendResponse({ ok: true, count: plans.length });
      });
      return true;

    case 'panel-role':
      ownsPanel = message.owns;
      if (!ownsPanel) panel?.unmount();
      else if (state) updatePanel(true);
      sendResponse({ ok: true });
      return false;

    case 'rescan':
      void refresh().then(() => sendResponse({ ok: true, count: plans.length }));
      return true;
    case 'fill-all':
      void fillAll().then(sendResponse);
      return true;
    case 'fill-one':
      void fillOne(message.uid, message.answerId, message.value).then((ok) => sendResponse({ ok }));
      return true;
    case 'save-answer':
      void saveAnswer(message.uid, message.value, message.answerId).then(() => sendResponse({ ok: true }));
      return true;
    case 'reveal':
      reveal(message.uid);
      sendResponse({ ok: true });
      return false;
    case 'toggle-panel':
      if (ownsPanel) {
        dismissed = false;
        if (!panel) void refresh();
        else {
          panel.mount();
          panel.toggle();
        }
      }
      sendResponse({ ok: true });
      return false;
    case 'tab-updated':

      if (ownsPanel && panel && state) panel.update(mergeFrames(message.snapshot.frames), state.answers);
      sendResponse({ ok: true });
      return false;
    default:
      return false;
  }
});

function mergeFrames(frames: Array<{ frameId: number; plans: FieldPlan[] }>): FieldPlan[] {
  const others = frames
    .filter((frame) => frame.frameId !== myFrameId)
    .flatMap((frame) => frame.plans);
  return [...plans, ...others];
}

function watchForChanges(): void {
  const observer = new MutationObserver(() => {
    if (rescanTimer) clearTimeout(rescanTimer);
    rescanTimer = setTimeout(() => void refresh(), 900);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

async function boot(): Promise<void> {
  if (!/^https?:$/.test(location.protocol)) return;
  await refresh();
  watchForChanges();
  watchForSubmit();

  await offerPendingReview();
}

void boot();
