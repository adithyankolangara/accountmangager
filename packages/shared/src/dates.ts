import { DEFAULT_LOCALE, DEFAULT_TIME_ZONE } from './constants';

/**
 * Calendar date (YYYY-MM-DD) of an instant in the given time zone. Use this to derive a
 * financial date from a timestamp: 2026-03-31T19:00Z is already 1 April in India.
 */
export function toLocalDateString(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Formats an instant for display in the user's time zone, e.g. "4 Oct 2026, 3:30 pm". */
export function formatDateTime(
  instant: Date | string,
  timeZone: string = DEFAULT_TIME_ZONE,
  locale: string = DEFAULT_LOCALE,
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(instant));
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(\d{2})$/;

/** First and last calendar day (inclusive) of a YYYY-MM month. */
export function monthRange(month: string): { from: string; to: string } {
  const match = ISO_MONTH.exec(month);
  if (!match) throw new RangeError(`Invalid month: ${month}`);
  const year = Number(match[1]);
  const m = Number(match[2]);
  const lastDay = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/** Adds (or subtracts) whole days to a YYYY-MM-DD date. */
export function addDays(isoDate: string, days: number): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new RangeError(`Invalid ISO date: ${isoDate}`);
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return d.toISOString().slice(0, 10);
}

/** Adds whole months to a YYYY-MM month. */
export function addMonths(month: string, months: number): string {
  const match = ISO_MONTH.exec(month);
  if (!match) throw new RangeError(`Invalid month: ${month}`);
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + months, 1));
  return d.toISOString().slice(0, 7);
}

/** "October 2026" for a YYYY-MM month. */
export function formatMonth(month: string, locale: string = DEFAULT_LOCALE): string {
  const { from } = monthRange(month);
  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${from}T00:00:00Z`));
}

/**
 * Formats a financial date (a date column with no time zone, e.g. a due date) without
 * shifting it: "2026-10-04" is shown as 4 Oct 2026 everywhere in the world.
 */
export function formatFinancialDate(isoDate: string, locale: string = DEFAULT_LOCALE): string {
  const match = ISO_DATE.exec(isoDate);
  if (!match) throw new RangeError(`Invalid ISO date: ${isoDate}`);
  const [, year, month, day] = match;
  const utc = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', dateStyle: 'medium' }).format(utc);
}
