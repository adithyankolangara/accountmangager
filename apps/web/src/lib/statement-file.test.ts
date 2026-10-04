import { describe, expect, it } from 'vitest';
import { buildRows, guessMapping, type Sheet } from './statement-file';

/** Shaped like a typical Indian bank CSV export: preamble, header, rows, footer. */
const bankExport: Sheet = [
  ['Account statement for XXXXXXXX4821'],
  ['Period', '01/09/2026 to 30/09/2026'],
  [],
  [
    'Date',
    'Narration',
    'Chq./Ref.No.',
    'Value Dt',
    'Withdrawal Amt.',
    'Deposit Amt.',
    'Closing Balance',
  ],
  [
    '01/09/26',
    'NEFT CR-DEMO EMPLOYER-SALARY',
    'UTR0001',
    '01/09/26',
    '',
    '85,000.00',
    '1,27,000.00',
  ],
  ['03/09/26', 'UPI/FRESH MART/groceries', '412345', '03/09/26', '2,345.50', '', '1,24,654.50'],
  ['05/09/26', 'RENT SEPT', '', '05/09/26', '18,000.00', '', '1,06,654.50'],
  ['', 'Closing balance', '', '', '', '', '1,06,654.50'],
];

describe('guessMapping', () => {
  it('finds the header row, columns, amount style and date format', () => {
    const mapping = guessMapping(bankExport);
    expect(mapping).toMatchObject({
      headerRow: 3,
      date: 0,
      description: 1,
      reference: 2,
      amountMode: 'split',
      debit: 4,
      credit: 5,
      dateFormat: 'DD/MM/YY',
    });
  });

  it('falls back to a signed amount column', () => {
    const mapping = guessMapping([
      ['Transaction Date', 'Description', 'Amount'],
      ['2026-09-01', 'Coffee', '-120.00'],
    ]);
    expect(mapping).toMatchObject({
      headerRow: 0,
      amountMode: 'signed',
      amount: 2,
      dateFormat: 'YYYY-MM-DD',
    });
  });
});

describe('buildRows', () => {
  it('turns debits into negative amounts and leaves out non-transaction lines', () => {
    const { rows, unreadable } = buildRows(bankExport, guessMapping(bankExport));
    expect(rows).toEqual([
      {
        rowNumber: 5,
        valueDate: '2026-09-01',
        amount: '85000.00',
        description: 'NEFT CR-DEMO EMPLOYER-SALARY',
        reference: 'UTR0001',
      },
      {
        rowNumber: 6,
        valueDate: '2026-09-03',
        amount: '-2345.50',
        description: 'UPI/FRESH MART/groceries',
        reference: '412345',
      },
      {
        rowNumber: 7,
        valueDate: '2026-09-05',
        amount: '-18000.00',
        description: 'RENT SEPT',
        reference: null,
      },
    ]);
    expect(unreadable).toEqual([8]);
  });

  it('applies a Dr/Cr column', () => {
    const sheet: Sheet = [
      ['Date', 'Particulars', 'Amount', 'Dr/Cr'],
      ['04-Oct-2026', 'ATM', '5,000', 'DR'],
      ['04-Oct-2026', 'Refund', '499', 'CR'],
    ];
    const { rows } = buildRows(sheet, guessMapping(sheet));
    expect(rows.map((r) => r.amount)).toEqual(['-5000.00', '499.00']);
    expect(rows[0]!.valueDate).toBe('2026-10-04');
  });
});
