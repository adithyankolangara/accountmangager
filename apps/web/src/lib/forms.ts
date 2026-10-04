import type { z } from 'zod';
import { ApiRequestError } from '../api/client';

export type FieldErrors = Record<string, string>;

/** First message per field path, from a Zod failure. */
export function zodFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'form';
    errors[path] ??= issue.message;
  }
  return errors;
}

/** Field errors from an API validation failure; anything else becomes a form-level message. */
export function apiFieldErrors(error: unknown): FieldErrors {
  if (error instanceof ApiRequestError) {
    const issues = error.fieldIssues;
    if (issues.length > 0) {
      const errors: FieldErrors = {};
      for (const issue of issues) errors[issue.path || 'form'] ??= issue.message;
      return errors;
    }
    return { form: error.message };
  }
  return { form: 'Something went wrong. Please try again.' };
}

/** Amount as typed by a person ("1,23,456.5") to the API's decimal string ("123456.5"). */
export const cleanAmount = (value: string) => value.replace(/[,\s₹]/g, '');

/** Optional text fields: empty input is sent as null so the API clears the value. */
export const orNull = (value: string) => (value.trim() === '' ? null : value.trim());
