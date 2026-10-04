import { z } from 'zod';
import { MONEY_PATTERN, parseMoney } from '../money';

export const moneyString = z
  .string()
  .trim()
  .regex(MONEY_PATTERN, 'Enter an amount with at most 2 decimal places')
  .meta({ description: 'Decimal amount as a string (never a float)', example: '123456.78' });

// Zod runs refinements even after the format check fails; that failure is already reported.
export const positiveMoney = moneyString
  .refine((v) => !MONEY_PATTERN.test(v) || parseMoney(v).gt(0), 'Amount must be more than zero')
  .meta({ description: 'Positive decimal amount as a string', example: '1499.00' });

export const isoDate = z.iso.date().meta({ description: 'Calendar date', example: '2026-10-04' });

export const isoMonth = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM')
  .meta({ example: '2026-10' });

export const version = z
  .number()
  .int()
  .positive()
  .meta({ description: 'Version read by the client; the update fails with 409 if it changed.' });

/**
 * Optional free text: trimmed, empty string stored as null. Stays undefined when absent so a
 * partial update leaves the field unchanged.
 */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `At most ${max} characters`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional();

export const errorCodes = [
  'bad_request',
  'validation_failed',
  'unauthenticated',
  'forbidden',
  'csrf_failed',
  'not_found',
  'conflict',
  'rate_limited',
  'internal_error',
  'service_unavailable',
] as const;
export type ErrorCode = (typeof errorCodes)[number];

export const errorBody = z
  .object({
    error: z.object({
      code: z.enum(errorCodes),
      message: z.string(),
      details: z.unknown().optional(),
      requestId: z.string().optional(),
    }),
  })
  .meta({ id: 'Error', description: 'Every API error uses this shape.' });
export type ErrorBody = z.infer<typeof errorBody>;

export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });
