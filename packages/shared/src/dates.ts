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
