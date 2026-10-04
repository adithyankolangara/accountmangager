import type { IncomeFrequency } from './domain';

/**
 * Whether an income source is expected to pay in the given month (YYYY-MM).
 * Quarterly and yearly sources repeat from the month of their start date.
 */
export function isExpectedInMonth(
  frequency: IncomeFrequency,
  startDate: string,
  month: string,
): boolean {
  if (frequency === 'irregular') return false;
  const start = startDate.slice(0, 7);
  if (month < start) return false;
  if (frequency === 'monthly') return true;
  const [sy, sm] = start.split('-').map(Number) as [number, number];
  const [my, mm] = month.split('-').map(Number) as [number, number];
  const elapsed = (my - sy) * 12 + (mm - sm);
  return frequency === 'quarterly' ? elapsed % 3 === 0 : elapsed % 12 === 0;
}
