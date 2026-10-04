import { z } from 'zod';
import { ACCOUNT_KINDS, ACCOUNT_STATUSES, VISIBILITIES } from '../domain';
import { isoDate, moneyString, optionalText, version } from './common';

const maskedReference = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(
    z
      .string()
      .regex(/^([0-9A-Za-z]{4})?$/, 'Enter only the last 4 digits, never the full account number'),
  )
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()
  .meta({ description: 'Last 4 characters of the account number only', example: '4321' });

const ifsc = z
  .string()
  .trim()
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^([A-Z]{4}0[A-Z0-9]{6})?$/, 'IFSC looks like ABCD0123456'))
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional();

const accountFields = {
  nickname: z.string().trim().min(1, 'Give the account a name').max(60),
  kind: z.enum(ACCOUNT_KINDS),
  institution: optionalText(80),
  maskedReference,
  ifsc,
  branch: optionalText(80),
  openingBalance: moneyString.default('0.00'),
  openingDate: isoDate,
  notes: optionalText(500),
};

export const accountInput = z.object(accountFields).meta({ id: 'AccountInput' });
export type AccountInput = z.input<typeof accountInput>;

// No default here: an update that omits the opening balance must leave it unchanged.
export const accountUpdate = z
  .object({ ...accountFields, openingBalance: moneyString })
  .partial()
  .extend({ status: z.enum(ACCOUNT_STATUSES).optional(), version })
  .meta({ id: 'AccountUpdate' });
export type AccountUpdate = z.input<typeof accountUpdate>;

export const account = z
  .object({
    id: z.uuid(),
    nickname: z.string(),
    kind: z.enum(ACCOUNT_KINDS),
    institution: z.string().nullable(),
    maskedReference: z.string().nullable(),
    ifsc: z.string().nullable(),
    branch: z.string().nullable(),
    openingBalance: moneyString,
    openingDate: isoDate,
    currency: z.string(),
    status: z.enum(ACCOUNT_STATUSES),
    notes: z.string().nullable(),
    visibility: z.enum(VISIBILITIES),
    isDemo: z.boolean(),
    balance: moneyString.meta({
      description:
        'Calculated: opening balance plus every transaction dated from the opening date up to today.',
    }),
    balanceAsOf: isoDate,
    lastTransactionDate: isoDate.nullable(),
    lastObservation: z
      .object({ balance: moneyString, observedOn: isoDate })
      .nullable()
      .meta({ description: 'Most recent balance the user entered or reconciled to.' }),
    version: z.number().int(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .meta({ id: 'Account' });
export type Account = z.infer<typeof account>;

export const reconcileInput = z
  .object({
    actualBalance: moneyString,
    asOf: isoDate,
    createAdjustment: z.boolean().default(true),
    note: optionalText(200),
  })
  .meta({ id: 'ReconcileInput' });
export type ReconcileInput = z.input<typeof reconcileInput>;
