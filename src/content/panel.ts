import { FONTS, PANEL_FONT, PANEL_STYLESHEET } from '../shared/paths.ts';
import type { Answer, FieldPlan, PanelCorner, PendingReview } from '../shared/types.ts';

const MARGIN = 16;
const DRAG_THRESHOLD = 4;
const SPRING = 'cubic-bezier(0.34, 1.42, 0.64, 1)';
const SETTLE = 420;

function stillness(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

let fontsRequested = false;

async function loadPanelFont(): Promise<void> {
  if (fontsRequested || typeof FontFace !== 'function') return;
  fontsRequested = true;
  try {
    await Promise.all(FONTS.map(async ({ file, weight, style }) => {
      const face = new FontFace(PANEL_FONT, `url(${chrome.runtime.getURL(file)})`, {
        weight: String(weight),
        style,
        display: 'swap'
      });
      await face.load();
      document.fonts.add(face);
    }));
  } catch {
    fontsRequested = false;
  }
}

export interface PanelCallbacks {
  onSaveReview(uids: string[]): void;
  onCorner(corner: PanelCorner): void;
  onDismissReview(): void;
  onFillAll(): void;
  onFillOne(plan: FieldPlan): void;
  onSave(plan: FieldPlan, value: string, answerId?: string): void;
  onReveal(plan: FieldPlan): void;
  onRescan(): void;
  onOpenOptions(): void;
  onDismiss(): void;
}

type TabName = 'review' | 'done' | 'all';

const STROKE = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

const ICONS = {
  rescan: `<svg viewBox="0 0 16 16" width="13" height="13" ${STROKE}><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M13.5 2.5V5H11"/></svg>`,
  settings: `<svg viewBox="0 0 16 16" width="13" height="13" ${STROKE}><path d="M2.5 4.5h11M2.5 11.5h11"/><circle cx="6" cy="4.5" r="1.8"/><circle cx="10.5" cy="11.5" r="1.8"/></svg>`,
  minimise: `<svg viewBox="0 0 16 16" width="13" height="13" ${STROKE}><path d="M3.5 8h9"/></svg>`,
  close: `<svg viewBox="0 0 16 16" width="13" height="13" ${STROKE}><path d="M4 4l8 8M12 4l-8 8"/></svg>`
};

export class Panel {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private root: HTMLElement;
  private plans: FieldPlan[] = [];
  private answers: Answer[] = [];
  private tab: TabName = 'review';

  private pending: PendingReview | null = null;
  private corner: PanelCorner = 'br';
  private drafts = new Map<string, string>();
  private lastHeight = 0;
  private listScroll = 0;
  private dragging = false;
  private suppressClick = false;
  private origin = { x: 0, y: 0, left: 0, top: 0 };
  private open = false;
  private busy = false;
  private status = '';

  constructor(private callbacks: PanelCallbacks) {
    this.host = document.createElement('div');
    this.host.id = 'jobfill-panel-host';

    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.root = document.createElement('div');
    this.root.className = 'root';
    this.shadow.append(this.root);
    void this.loadStyles();
    this.root.addEventListener('click', (event) => this.onClick(event));
    this.root.addEventListener('keydown', (event) => this.onKeydown(event as KeyboardEvent));
    this.root.addEventListener('input', (event) => this.rememberDraft(event));
    this.root.addEventListener('scroll', (event) => this.rememberScroll(event), true);
    this.root.addEventListener('pointerdown', (event) => this.onPointerDown(event as PointerEvent));
    window.addEventListener('resize', () => this.place());
    void loadPanelFont();
  }

  private async loadStyles(): Promise<void> {
    const style = document.createElement('style');
    try {
      style.textContent = await (await fetch(chrome.runtime.getURL(PANEL_STYLESHEET))).text();
    } catch {
      style.textContent = '.root{position:fixed;right:16px;bottom:16px;z-index:2147483000;font:13px sans-serif;color:#fff}';
    }
    this.shadow.prepend(style);
  }

  mount(): void {
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
    this.place();
  }

  setCorner(corner: PanelCorner): void {
    this.corner = corner;
    this.place();
  }

  private place(): void {
    if (!this.host.isConnected) return;
    const root = this.root;
    const top = this.corner[0] === 't';
    const left = this.corner[1] === 'l';

    root.style.top = top ? `${MARGIN}px` : 'auto';
    root.style.bottom = top ? 'auto' : `${MARGIN}px`;
    root.style.left = left ? `${MARGIN}px` : 'auto';
    root.style.right = left ? 'auto' : `${MARGIN}px`;
    root.style.setProperty('--origin', `${top ? 'top' : 'bottom'} ${left ? 'left' : 'right'}`);
  }

  private async transition(render: () => void): Promise<void> {
    const outgoing = this.root.firstElementChild as HTMLElement | null;

    if (outgoing && !stillness()) {
      await outgoing
        .animate(
          [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.96)' }],
          { duration: 110, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }
        )
        .finished.catch(() => undefined);
    }

    render();

    const incoming = this.root.firstElementChild as HTMLElement | null;
    if (incoming && !stillness()) {
      incoming.animate(
        [{ opacity: 0, transform: 'scale(0.96)' }, { opacity: 1, transform: 'scale(1)' }],
        { duration: 260, easing: SPRING }
      );
    }
  }

  private onPointerDown(event: PointerEvent): void {
    const handle = (event.target as HTMLElement).closest('.head, .pill');
    if (!handle || event.button !== 0) return;

    const rect = this.root.getBoundingClientRect();
    this.origin = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };

    const move = (moveEvent: PointerEvent): void => {
      const dx = moveEvent.clientX - this.origin.x;
      const dy = moveEvent.clientY - this.origin.y;

      if (!this.dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        this.dragging = true;
        this.root.classList.add('dragging');
        this.root.style.transition = 'none';
      }

      const width = this.root.getBoundingClientRect().width;
      const height = this.root.getBoundingClientRect().height;
      this.root.style.left = `${Math.min(Math.max(this.origin.left + dx, MARGIN), window.innerWidth - width - MARGIN)}px`;
      this.root.style.top = `${Math.min(Math.max(this.origin.top + dy, MARGIN), window.innerHeight - height - MARGIN)}px`;
    };

    const up = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!this.dragging) return;

      this.dragging = false;
      this.suppressClick = true;
      this.root.classList.remove('dragging');

      const first = this.root.getBoundingClientRect();
      const vertical = first.top + first.height / 2 < window.innerHeight / 2 ? 't' : 'b';
      const horizontal = first.left + first.width / 2 < window.innerWidth / 2 ? 'l' : 'r';
      const corner = `${vertical}${horizontal}` as PanelCorner;

      const moved = corner !== this.corner;
      this.corner = corner;
      this.place();

      const last = this.root.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if ((dx || dy) && !stillness()) {
        this.root.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: SETTLE, easing: SPRING }
        );
      }

      if (moved) this.callbacks.onCorner(corner);
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  private rememberDraft(event: Event): void {
    const field = event.target as HTMLElement;
    const role = field.getAttribute('data-role');
    const key = field.getAttribute('data-key');
    if (!role || !key) return;
    this.drafts.set(`${role}:${key}`, (field as HTMLInputElement).value);
  }

  private rememberScroll(event: Event): void {
    const list = event.target as HTMLElement;
    if (list.classList?.contains('list')) this.listScroll = list.scrollTop;
  }

  private restore(): void {
    for (const field of this.root.querySelectorAll<HTMLInputElement>('[data-role][data-key]')) {
      const draft = this.drafts.get(`${field.getAttribute('data-role')}:${field.getAttribute('data-key')}`);
      if (draft !== undefined && draft !== field.value) field.value = draft;
    }
    const list = this.root.querySelector('.list');
    if (list && this.listScroll) list.scrollTop = this.listScroll;
  }

  unmount(): void {
    this.host.remove();
  }

  setOpen(open: boolean): void {
    if (this.open === open) {
      this.render();
      return;
    }
    this.open = open;
    void this.transition(() => this.render());
  }

  toggle(): void {
    this.setOpen(!this.open);
  }

  get isOpen(): boolean {
    return this.open;
  }

  setBusy(busy: boolean, status = ''): void {
    this.busy = busy;
    this.status = status;
    this.render();
  }

  update(plans: FieldPlan[], answers: Answer[]): void {
    this.plans = plans;
    this.answers = answers;
    this.render();
  }

  setReview(review: PendingReview | null): void {
    const changed = !!this.pending !== !!review;
    this.pending = review;
    if (review) this.open = true;
    if (changed) void this.transition(() => this.render());
    else this.render();
  }

  get hasReview(): boolean {
    return !!this.pending;
  }

  private counts() {
    const by = (status: FieldPlan['status']) => this.plans.filter((p) => p.status === status).length;
    return {
      total: this.plans.length,
      filled: by('filled'),
      ready: by('ready'),
      suggest: by('suggest'),
      unknown: by('unknown'),
      failed: by('failed')
    };
  }

  private visiblePlans(): FieldPlan[] {
    if (this.tab === 'all') return this.plans;
    if (this.tab === 'done') return this.plans.filter((p) => p.status === 'filled');
    return this.plans.filter((p) => p.status === 'suggest' || p.status === 'unknown' || p.status === 'failed' || p.status === 'ready');
  }

  private render(): void {
    if (this.pending) {
      this.renderReview(this.pending);
      this.after();
      return;
    }
    const counts = this.counts();
    const needsAttention = counts.suggest + counts.unknown + counts.failed;

    if (!this.open) {
      this.collapsed(counts, needsAttention);
      return;
    }

    this.expanded(counts, needsAttention);
  }

  private collapsed(counts: ReturnType<Panel['counts']>, needsAttention: number): void {
    {
      this.root.innerHTML = `
        <button class="pill" data-act="open" title="Open JobFill (Alt+Shift+J)">
          <span class="mark">JobFill</span>
          ${counts.ready ? `<span class="count">${counts.ready} ready</span>` : ''}
          ${!counts.ready && needsAttention ? `<span class="count">${needsAttention} to review</span>` : ''}
        </button>`;
      this.after();
    }
  }

  private expanded(counts: ReturnType<Panel['counts']>, needsAttention: number): void {

    this.root.innerHTML = `
      <section class="panel" role="dialog" aria-label="JobFill">
        <header class="head">
          <h1>JobFill
            <span class="sub">${counts.total} question${counts.total === 1 ? '' : 's'} found on this page</span>
          </h1>
          <button class="icon-btn" data-act="rescan" title="Scan the page again" aria-label="Scan the page again">${ICONS.rescan}</button>
          <button class="icon-btn" data-act="options" title="Manage answers" aria-label="Manage answers">${ICONS.settings}</button>
          <button class="icon-btn" data-act="close" title="Minimise, everything stays" aria-label="Minimise">${ICONS.minimise}</button>
        </header>

        <div class="actions">
          <button class="primary" data-act="fill-all" ${this.busy || !counts.ready ? 'disabled' : ''}>
            ${this.busy ? 'Filling…' : counts.ready ? `Fill ${counts.ready} field${counts.ready === 1 ? '' : 's'}` : 'Nothing ready to fill'}
          </button>
          <button class="ghost" data-act="dismiss" title="Hide JobFill on this site">Not now</button>
        </div>

        <nav class="tabs" role="tablist">
          <button class="tab" role="tab" data-tab="review" aria-selected="${this.tab === 'review'}">
            To do${needsAttention + counts.ready ? ` (${needsAttention + counts.ready})` : ''}
          </button>
          <button class="tab" role="tab" data-tab="done" aria-selected="${this.tab === 'done'}">Filled (${counts.filled})</button>
          <button class="tab" role="tab" data-tab="all" aria-selected="${this.tab === 'all'}">All (${counts.total})</button>
        </nav>

        <div class="list">${this.renderList()}</div>

        <footer class="foot">
          <span>${this.status || `${this.answers.length} answers saved`}</span>
          <a data-act="options">Manage answers</a>
        </footer>
      </section>`;
  this.after();
  }

  private after(): void {
    this.restore();
    this.place();

    const panel = this.root.querySelector('.panel') as HTMLElement | null;
    if (!panel) {
      this.lastHeight = 0;
      return;
    }

    const height = panel.getBoundingClientRect().height;
    if (this.lastHeight && Math.abs(height - this.lastHeight) > 2 && !stillness()) {
      panel.animate(
        [{ height: `${this.lastHeight}px` }, { height: `${height}px` }],
        { duration: 240, easing: SPRING }
      );
    }
    this.lastHeight = height;
  }

  private renderReview(review: PendingReview): string | void {
    const rows = review.items.map((item, index) => {
      const badge = item.action === 'new' ? 'new' : item.action === 'update' ? 'suggest' : 'filled';
      const note = item.action === 'update'
        ? `Replaces “${escapeHtml(item.previous ?? '')}”`
        : item.action === 'alias'
          ? 'Same answer, a wording JobFill had not seen'
          : '';

      return `
        <article class="row">
          <label class="q pick">
            <input type="checkbox" data-role="keep" data-index="${index}" ${item.action === 'update' ? '' : 'checked'} />
            <span class="text">${escapeHtml(item.question)}</span>
            <span class="badge ${badge}">${item.action}</span>
          </label>
          <div class="val">${escapeHtml(item.value)}</div>
          ${note ? `<div class="why">${note}</div>` : ''}
        </article>`;
    }).join('');

    this.root.innerHTML = `
      <section class="panel" role="dialog" aria-label="Save these answers">
        <header class="head">
          <h1>Application sent
            <span class="sub">${escapeHtml(review.host)}. Keep these answers for next time?</span>
          </h1>
          <button class="icon-btn" data-act="dismiss-review" title="Not now" aria-label="Not now">${ICONS.close}</button>
        </header>

        <div class="list">${rows || '<p class="empty">Nothing new to save. JobFill already knew all of it.</p>'}</div>

        <div class="actions">
          <button class="primary" data-act="save-review">Save ${review.items.length} answer${review.items.length === 1 ? '' : 's'}</button>
          <button class="ghost" data-act="dismiss-review">Not now</button>
        </div>
      </section>`;
  }

  private renderList(): string {
    const plans = this.visiblePlans();
    if (!plans.length) {
      return `<p class="empty">${this.tab === 'done'
        ? 'Nothing filled yet.'
        : 'All caught up. Every question on this page has an answer.'}</p>`;
    }
    return plans.map((plan) => this.renderRow(plan)).join('');
  }

  private renderRow(plan: FieldPlan): string {
    const label = escapeHtml(plan.field.label || plan.field.name || 'Untitled question');
    const badge = plan.status;
    const key = `${plan.frameId}:${plan.field.uid}`;

    const header = `
      <div class="q" data-act="reveal" data-key="${key}" title="Scroll to this field">
        <span class="text">${label}</span>
        <span class="badge ${badge}">${badgeText(plan)}</span>
      </div>`;

    if (plan.status === 'filled') {
      return `<article class="row" data-key="${key}">${header}
        <div class="val">${escapeHtml(plan.value || plan.field.currentValue)}</div>
      </article>`;
    }

    if (plan.status === 'ready') {
      return `<article class="row" data-key="${key}">${header}
        <div class="val">${escapeHtml(plan.value || '')}</div>
        <div class="controls">
          <button class="small accent" data-act="fill-one" data-key="${key}">Fill</button>
          <button class="small" data-act="edit" data-key="${key}">Use another answer</button>
        </div>
      </article>`;
    }

    if (plan.status === 'suggest') {
      const guess = this.answers.find((a) => a.id === plan.answerId);
      return `<article class="row" data-key="${key}">${header}
        <div class="why">Closest saved answer: <strong>${escapeHtml(guess?.question ?? '')}</strong></div>
        <div class="val">${escapeHtml(plan.value || guess?.value || '')}</div>
        <div class="controls">
          <button class="small accent" data-act="confirm" data-key="${key}">Yes, use it and remember</button>
          <button class="small" data-act="edit" data-key="${key}">No, something else</button>
        </div>
      </article>`;
    }

    return `<article class="row" data-key="${key}">${header}
      ${plan.note ? `<div class="why">${escapeHtml(plan.note)}</div>` : ''}
      ${this.renderEditor(plan, key)}
    </article>`;
  }

  private renderEditor(plan: FieldPlan, key: string): string {
    const field = plan.field;
    const existing = plan.value ?? field.currentValue ?? '';

    const valueInput = field.options.length
      ? `<select data-role="value" data-key="${key}">
           <option value="">Pick an option…</option>
           ${field.options
             .filter((opt) => opt.text)
             .map((opt) => `<option value="${escapeHtml(opt.text)}" ${opt.text === existing ? 'selected' : ''}>${escapeHtml(opt.text)}</option>`)
             .join('')}
         </select>`
      : field.control === 'textarea'
        ? `<textarea data-role="value" data-key="${key}" placeholder="Your answer, saved for next time">${escapeHtml(existing)}</textarea>`
        : `<input type="text" data-role="value" data-key="${key}" value="${escapeHtml(existing)}" placeholder="Your answer, saved for next time">`;

    const linkOptions = this.answers
      .filter((a) => !a.archived)
      .slice()
      .sort((a, b) => a.question.localeCompare(b.question))
      .map((a) => `<option value="${a.id}" ${plan.answerId === a.id ? 'selected' : ''}>${escapeHtml(a.question)}</option>`)
      .join('');

    return `
      <div class="controls">${valueInput}</div>
      <div class="controls">
        <select data-role="link" data-key="${key}" title="Add this question to an answer you already have">
          <option value="">Save as a new answer</option>
          ${linkOptions}
        </select>
        <button class="small accent" data-act="save" data-key="${key}">Save &amp; fill</button>
      </div>`;
  }

  private planFor(key: string | null): FieldPlan | undefined {
    if (!key) return undefined;
    const [frameId, uid] = key.split(':');
    return this.plans.find((p) => String(p.frameId) === frameId && p.field.uid === uid);
  }

  private clearDraft(key: string): void {
    this.drafts.delete(`value:${key}`);
    this.drafts.delete(`link:${key}`);
  }

  private valueFor(key: string): string {
    const input = this.root.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      `[data-role="value"][data-key="${CSS.escape(key)}"]`
    );
    return input ? input.value.trim() : '';
  }

  private linkFor(key: string): string | undefined {
    const select = this.root.querySelector<HTMLSelectElement>(`[data-role="link"][data-key="${CSS.escape(key)}"]`);
    return select?.value || undefined;
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    const target = event.target as HTMLElement;
    if (target.getAttribute('data-role') !== 'value' || target.tagName === 'TEXTAREA') return;
    event.preventDefault();
    const key = target.getAttribute('data-key');
    const plan = this.planFor(key);
    if (plan && key) this.callbacks.onSave(plan, this.valueFor(key), this.linkFor(key));
  }

  private onClick(event: Event): void {
    const target = (event.target as HTMLElement).closest('[data-act], [data-tab]') as HTMLElement | null;
    if (!target) return;
    if (this.suppressClick && target.getAttribute('data-act') !== 'open') {
      this.suppressClick = false;
      return;
    }

    const tabName = target.getAttribute('data-tab');
    if (tabName) {
      this.tab = tabName as TabName;
      this.render();
      return;
    }

    const action = target.getAttribute('data-act');
    const key = target.getAttribute('data-key');
    const plan = this.planFor(key);

    switch (action) {
      case 'save-review': {
        const keep = [...this.root.querySelectorAll<HTMLInputElement>('[data-role="keep"]')]
          .filter((box) => box.checked)
          .map((box) => this.pending?.items[Number(box.dataset.index)]?.uid)
          .filter((uid): uid is string => !!uid);
        this.callbacks.onSaveReview(keep);
        break;
      }
      case 'dismiss-review':
        this.callbacks.onDismissReview();
        break;
      case 'open':
        if (this.suppressClick) { this.suppressClick = false; break; }
        this.setOpen(true);
        break;
      case 'close': this.setOpen(false); break;
      case 'rescan': this.callbacks.onRescan(); break;
      case 'options': this.callbacks.onOpenOptions(); break;
      case 'fill-all': this.callbacks.onFillAll(); break;
      case 'dismiss': this.callbacks.onDismiss(); break;
      case 'reveal': if (plan) this.callbacks.onReveal(plan); break;
      case 'fill-one': if (plan) this.callbacks.onFillOne(plan); break;
      case 'confirm':

        if (plan) this.callbacks.onSave(plan, plan.value ?? '', plan.answerId);
        break;
      case 'edit':
        if (plan) {
          plan.status = 'unknown';
          plan.note = 'Pick the right answer, or type a new one.';
          this.render();
        }
        break;
      case 'save':
        if (plan && key) {
          const value = this.valueFor(key);
          const link = this.linkFor(key);
          this.clearDraft(key);
          this.callbacks.onSave(plan, value, link);
        }
        break;
      default: break;
    }
  }
}

function badgeText(plan: FieldPlan): string {
  switch (plan.status) {
    case 'filled': return 'filled';
    case 'ready': return 'ready';
    case 'suggest': return `guess ${Math.round((plan.score ?? 0) * 100)}%`;
    case 'failed': return 'needs you';
    case 'skipped': return 'skipped';
    default: return 'new';
  }
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
