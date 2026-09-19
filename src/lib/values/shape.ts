import { squish } from '../matching/text.ts';

export interface FieldShape {
  type?: string;
  maxLength?: number | null;
  placeholder?: string;
  min?: string | null;
  max?: string | null;
  step?: string | null;
}

const MONTH_YEAR = /^(\d{1,2})[/-](\d{4})$/;
const YEAR_ONLY = /^(19|20)\d{2}$/;
const US_DATE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function pad(value: number | string): string {
  return String(value).padStart(2, '0');
}

export function toIsoDate(value: string): string | null {
  const raw = squish(value);
  if (ISO_DATE.test(raw)) return raw;

  const us = US_DATE.exec(raw);
  if (us) return `${us[3]}-${pad(us[1]!)}-${pad(us[2]!)}`;

  const monthYear = MONTH_YEAR.exec(raw);
  if (monthYear) return `${monthYear[2]}-${pad(monthYear[1]!)}-01`;

  if (YEAR_ONLY.test(raw)) return `${raw}-01-01`;
  return null;
}

export function toMonthValue(value: string): string | null {
  const iso = toIsoDate(value);
  return iso ? iso.slice(0, 7) : null;
}

export function toNumber(value: string, shape: FieldShape): string | null {
  const raw = squish(value).replace(/[, ]/g, '');
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) return null;

  const step = shape.step ? Number.parseFloat(shape.step) : 1;
  const wholeOnly = shape.step === 'any' ? false : !Number.isFinite(step) || Number.isInteger(step);
  let result = wholeOnly ? Math.round(parsed) : parsed;

  const min = shape.min != null && shape.min !== '' ? Number.parseFloat(shape.min) : null;
  const max = shape.max != null && shape.max !== '' ? Number.parseFloat(shape.max) : null;
  if (min != null && Number.isFinite(min)) result = Math.max(result, min);
  if (max != null && Number.isFinite(max)) result = Math.min(result, max);

  return String(result);
}

export function shapeValue(value: string, shape: FieldShape): string {
  const raw = squish(value);
  if (!raw) return raw;

  if (shape.type === 'number') return toNumber(raw, shape) ?? raw;
  if (shape.type === 'date') return toIsoDate(raw) ?? raw;
  if (shape.type === 'month') return toMonthValue(raw) ?? raw;

  return raw;
}
