import { z } from 'zod';
import { MONEY_PATTERN } from '../money';

export const moneyString = z
  .string()
  .regex(MONEY_PATTERN, 'Amount must be a decimal with at most 2 decimal places')
  .meta({ description: 'Decimal amount as a string (never a float)', example: '123456.78' });

export const errorCodes = [
  'bad_request',
  'validation_failed',
  'unauthenticated',
  'forbidden',
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
