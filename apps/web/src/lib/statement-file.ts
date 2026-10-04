import Papa from 'papaparse';
import {
  parseStatementAmount,
  parseStatementDate,
  STATEMENT_DATE_FORMATS,
  type ImportRow,
  type StatementDateFormat,
} from '@smartfin/shared';

export type Cell = string | number | boolean | Date | null;
export type Sheet = Cell[][];

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Reads a CSV or XLSX statement into rows of cells, entirely in the browser. */
export async function readStatementFile(file: File): Promise<Sheet> {
  if (file.size > MAX_FILE_BYTES) throw new Error('The file is larger than 5 MB.');
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) {
    // The worker-free build: the page's security policy doesn't allow blob: workers.
    const { readSheet } = await import('read-excel-file/web-worker');
    return (await readSheet(file)) as Sheet;
  }
  if (name.endsWith('.xls')) {
    throw new Error(
      'Old .xls files aren’t supported. Save the statement as .xlsx or .csv and try again.',
    );
  }
  return new Promise<Sheet>((resolve, reject) => {
    Papa.parse<string[]>(file, {
      skipEmptyLines: 'greedy',
      complete: (result) => resolve(result.data),
      error: (err) => reject(new Error(`Couldn’t read the file: ${err.message}`)),
    });
  });
}

export type AmountMode = 'signed' | 'split' | 'drcr';

export interface Mapping {
  headerRow: number; // -1 = no header row
  date: number;
  description: number;
  reference: number;
  amountMode: AmountMode;
  amount: number;
  debit: number;
  credit: number;
  drcr: number;
  dateFormat: StatementDateFormat;
}

const text = (cell: Cell | undefined) =>
  cell === null || cell === undefined ? '' : String(cell).trim();

/** Bank exports often start with account details; the header is the first row naming a date column. */
function findHeaderRow(sheet: Sheet): number {
  for (let i = 0; i < Math.min(sheet.length, 25); i++) {
    const cells = sheet[i]!.map((c) => text(c).toLowerCase());
    if (cells.some((c) => c.includes('date')) && cells.filter(Boolean).length >= 3) return i;
  }
  return -1;
}

export function columnNames(sheet: Sheet, headerRow: number): string[] {
  const width = Math.max(0, ...sheet.slice(0, 50).map((r) => r.length));
  return Array.from({ length: width }, (_, i) => {
    const header = headerRow >= 0 ? text(sheet[headerRow]?.[i]) : '';
    return (
      header || `Column ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`
    );
  });
}

export const dataRows = (sheet: Sheet, headerRow: number) => sheet.slice(headerRow + 1);

function bestDateFormat(sheet: Sheet, headerRow: number, column: number): StatementDateFormat {
  if (column < 0) return 'DD/MM/YYYY';
  const sample = dataRows(sheet, headerRow)
    .slice(0, 30)
    .map((r) => r[column] ?? null);
  let best: StatementDateFormat = 'DD/MM/YYYY';
  let bestScore = -1;
  for (const format of STATEMENT_DATE_FORMATS) {
    const score = sample.filter((cell) => parseStatementDate(cell, format)).length;
    if (score > bestScore) {
      best = format;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Guesses the column mapping from common Indian bank statement headers. Pass a header row to
 * re-guess after the user picks it (-1 = no header).
 */
export function guessMapping(sheet: Sheet, forcedHeaderRow?: number): Mapping {
  const headerRow = forcedHeaderRow ?? findHeaderRow(sheet);
  const names = columnNames(sheet, headerRow).map((n) => n.toLowerCase());
  const find = (pattern: RegExp, exclude?: RegExp) =>
    names.findIndex((n) => pattern.test(n) && !(exclude && exclude.test(n)));
  const date = find(/date/, /value date/) >= 0 ? find(/date/, /value date/) : find(/date/);
  // A combined "Dr/Cr" column marks direction; it is neither the debit nor the credit column.
  const combined = /dr\s*\/\s*cr|cr\s*\/\s*dr/;
  const debit = find(/debit|withdraw|\bdr\b|paid out/, combined);
  const credit = find(/credit|deposit|\bcr\b|paid in/, combined);
  const drcr = find(/^(dr\s*\/\s*cr|cr\s*\/\s*dr|type)$/);
  const amount = find(/amount/);
  const amountMode: AmountMode =
    debit >= 0 && credit >= 0 ? 'split' : drcr >= 0 ? 'drcr' : 'signed';
  return {
    headerRow,
    date,
    description: find(/narration|description|particular|details|remark/),
    reference: find(/ref|chq|cheque|utr/),
    amountMode,
    amount,
    debit,
    credit,
    drcr,
    dateFormat: bestDateFormat(sheet, headerRow, date),
  };
}

export interface BuiltRows {
  rows: ImportRow[];
  unreadable: number[];
}

/** Turns mapped cells into API import rows; rows without a readable date and amount are listed. */
export function buildRows(sheet: Sheet, mapping: Mapping): BuiltRows {
  const rows: ImportRow[] = [];
  const unreadable: number[] = [];
  dataRows(sheet, mapping.headerRow).forEach((cells, index) => {
    const rowNumber = mapping.headerRow + 2 + index;
    const valueDate =
      mapping.date >= 0
        ? parseStatementDate(cells[mapping.date] ?? null, mapping.dateFormat)
        : null;
    let amount: string | null = null;
    if (mapping.amountMode === 'split') {
      const debit = mapping.debit >= 0 ? parseStatementAmount(cells[mapping.debit] ?? null) : null;
      const credit =
        mapping.credit >= 0 ? parseStatementAmount(cells[mapping.credit] ?? null) : null;
      if (debit && !/^-?0+(\.0+)?$/.test(debit)) amount = `-${debit.replace(/^-/, '')}`;
      else if (credit && !/^-?0+(\.0+)?$/.test(credit)) amount = credit.replace(/^-/, '');
    } else if (mapping.amount >= 0) {
      amount = parseStatementAmount(cells[mapping.amount] ?? null);
      if (amount && mapping.amountMode === 'drcr') {
        const isDebit = /^d/i.test(text(cells[mapping.drcr]));
        amount = isDebit ? `-${amount.replace(/^-/, '')}` : amount.replace(/^-/, '');
      }
    }
    if (!valueDate || !amount || /^-?0+(\.0+)?$/.test(amount)) {
      // Totals, opening-balance lines and blank rows end up here.
      if (cells.some((c) => text(c))) unreadable.push(rowNumber);
      return;
    }
    const description =
      mapping.description >= 0 ? text(cells[mapping.description]).slice(0, 200) : '';
    const reference = mapping.reference >= 0 ? text(cells[mapping.reference]).slice(0, 64) : '';
    rows.push({
      rowNumber,
      valueDate,
      amount,
      description: description || null,
      reference: reference || null,
    });
  });
  return { rows, unreadable };
}
