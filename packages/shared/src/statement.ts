import { toMoneyString } from './money';

/**
 * Parsing helpers for bank statement imports (CSV/XLSX). Bank exports differ widely, so the user
 * picks the date format and column mapping; these functions only normalise individual cells.
 */

export const STATEMENT_DATE_FORMATS = [
  'DD/MM/YYYY',
  'DD-MM-YYYY',
  'DD/MM/YY',
  'DD-MMM-YYYY',
  'YYYY-MM-DD',
  'MM/DD/YYYY',
] as const;
export type StatementDateFormat = (typeof STATEMENT_DATE_FORMATS)[number];

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function isoDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null; // e.g. 31/02
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Parses a statement date cell to YYYY-MM-DD, or null if it doesn't match the format.
 * Spreadsheet cells may already be Date objects; their calendar date is used as-is.
 */
export function parseStatementDate(value: unknown, format: StatementDateFormat): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return isoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value !== 'string') return null;
  const text = value.trim().replace(/[\sT]+\d{1,2}:\d{2}(:\d{2})?(\s*[AaPp][Mm])?$/, '');
  let m: RegExpExecArray | null;
  switch (format) {
    case 'DD/MM/YYYY':
    case 'DD-MM-YYYY':
      m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
      return m ? isoDate(Number(m[3]), Number(m[2]), Number(m[1])) : null;
    case 'DD/MM/YY':
      m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/.exec(text);
      return m ? isoDate(2000 + Number(m[3]), Number(m[2]), Number(m[1])) : null;
    case 'DD-MMM-YYYY':
      m = /^(\d{1,2})[\s/-]([A-Za-z]{3})[a-z]*[\s/-](\d{2}|\d{4})$/.exec(text);
      if (!m) return null;
      {
        const month = MONTHS[m[2]!.toLowerCase()];
        const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
        return month ? isoDate(year, month, Number(m[1])) : null;
      }
    case 'YYYY-MM-DD':
      m = /^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})$/.exec(text);
      return m ? isoDate(Number(m[1]), Number(m[2]), Number(m[3])) : null;
    case 'MM/DD/YYYY':
      m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
      return m ? isoDate(Number(m[3]), Number(m[1]), Number(m[2])) : null;
  }
}

/**
 * Parses an amount cell to a signed decimal string ("-1234.50"), or null if empty/invalid.
 * Accepts Indian grouping, currency symbols, brackets for negatives and Dr/Cr suffixes
 * (Dr = money out = negative).
 */
export function parseStatementAmount(value: unknown): string | null {
  if (typeof value === 'number') {
    // decimal.js reads the shortest decimal form of the float (1234.565, not 1234.5649…).
    return Number.isFinite(value) ? toMoneyString(value) : null;
  }
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (!text || text === '-') return null;
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  const suffix = /\s*(dr|cr)\.?$/i.exec(text);
  if (suffix) {
    negative = negative || suffix[1]!.toLowerCase() === 'dr';
    text = text.slice(0, suffix.index);
  }
  text = text.replace(/₹|rs\.?|inr/gi, '').replace(/[,\s]/g, '');
  if (text.startsWith('-')) {
    negative = !negative;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  // Round half-up to paisa without going through floating point.
  let paisa = BigInt(whole!) * 100n + BigInt((fraction + '00').slice(0, 2));
  if (Number(fraction[2] ?? '0') >= 5) paisa += 1n;
  const abs = `${paisa / 100n}.${String(paisa % 100n).padStart(2, '0')}`;
  return negative && paisa !== 0n ? `-${abs}` : abs;
}

/** Lower-cased, punctuation-free description used to compare transactions for duplicates. */
export function normalizeDescription(description: string | null | undefined): string {
  return (description ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
