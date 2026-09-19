export type AnswerType =
  | 'text' | 'longtext' | 'choice' | 'multichoice' | 'boolean'
  | 'number' | 'date' | 'email' | 'phone' | 'url' | 'file';

export interface Answer {
  id: string;

  kind: string | null;
  question: string;

  aliases: string[];
  type: AnswerType;
  value: string;
  choices?: string[];

  valueAliases?: Record<string, string[]>;

  scope: string;
  source: 'seed' | 'user' | 'profile' | 'import';

  control?: ControlKind;
  notes: string;
  archived: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PanelCorner = 'tl' | 'tr' | 'bl' | 'br';

export interface Settings {
  panelCorner: PanelCorner;

  askToSaveOnSubmit: boolean;
  autofillOnLoad: boolean;
  showPanel: boolean;
  autoAttachResume: boolean;
  fillConfidence: number;
  suggestConfidence: number;
  skipFilledFields: boolean;
  disabledHosts: string[];
}

export type Profile = Record<string, string>;

export interface ResumeRecord {
  name: string;
  type: string;
  size: number;
  dataUrl: string | null;
  text: string;
  parsedAt: string;
}

export interface Stats {
  filled: number;
  learned: number;
  applications: number;
}

export interface WorkEntry {
  title: string;
  company: string;
  location: string;
  start: string;
  end: string;
  current: boolean;
}

export interface State {
  version: number;
  profile: Profile;
  answers: Answer[];
  settings: Settings;
  resume: ResumeRecord | null;
  stats: Stats;

  pendingReview: PendingReview | null;
  history: WorkEntry[];
}

export interface FieldOption {
  value: string;
  text: string;

  el?: HTMLElement;
}

export type ControlKind =
  | 'input' | 'textarea' | 'select' | 'radio' | 'checkbox'
  | 'file' | 'combobox' | 'contenteditable';

export interface ScannedField {
  uid: string;
  el: HTMLElement;
  control: ControlKind;
  type: string;
  name: string;
  id: string;
  autocomplete: string;
  placeholder: string;
  pattern: string;
  label: string;
  context: string;
  required: boolean;
  options: FieldOption[];

  inputs?: HTMLInputElement[];
  currentValue: string;
  maxLength: number | null;
  kind: string | null;
}

export interface SerializedField {
  uid: string;
  control: ControlKind;
  type: string;
  name: string;
  id: string;
  label: string;
  context: string;
  placeholder: string;
  pattern: string;
  maxLength: number | null;
  required: boolean;
  kind: string | null;
  currentValue: string;
  options: Array<{ value: string; text: string }>;
}

export interface Kind {
  key: string;
  label: string;
  type: AnswerType;
  patterns: RegExp[];
  exclude?: RegExp[];
  auto?: string[];
  nameHints?: string[];
}

export interface RankedAnswer {
  answer: Answer;
  score: number;
  reason: 'kind' | 'exact' | 'alias' | 'fuzzy';
}

export interface BestMatch {
  status: 'fill' | 'suggest' | 'none';
  match?: RankedAnswer;
  candidates: RankedAnswer[];
}

export interface ReviewItem {
  uid: string;
  question: string;
  value: string;
  kind: string | null;
  control: ControlKind;
  type: AnswerType;
  choices?: string[];

  answerId?: string;

  action: 'new' | 'update' | 'alias';

  previous?: string;
}

export interface PendingReview {
  host: string;
  url: string;
  title: string;
  capturedAt: string;
  items: ReviewItem[];
}

export interface FieldPlan {
  field: SerializedField;
  frameId: number;
  status: 'filled' | 'ready' | 'suggest' | 'unknown' | 'skipped' | 'failed';
  answerId?: string;
  value?: string;
  score?: number;
  reason?: string;
  candidates?: Array<{ id: string; question: string; value: string; score: number }>;
  note?: string;
}
