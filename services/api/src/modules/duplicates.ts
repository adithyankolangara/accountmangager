import { and, between, eq, isNull, ne, type SQL } from 'drizzle-orm';
import { addDays, normalizeDescription, type DuplicateLevel } from '@smartfin/shared';
import type { Executor } from '../db/client';
import { transactions } from '../db/schema';

/** Window for "possible" duplicates: bank posting dates often lag the transaction date. */
export const DUPLICATE_WINDOW_DAYS = 2;

type Candidate = typeof transactions.$inferSelect;

export interface DuplicateProbe {
  valueDate: string;
  amount: string;
  description: string | null;
  reference: string | null;
}

/**
 * likely: same reference, or same date and description, with the same amount.
 * possible: same amount within the window. Amount alone never makes a match "likely".
 */
export function classifyDuplicate(probe: DuplicateProbe, existing: DuplicateProbe): DuplicateLevel {
  if (probe.reference && existing.reference) {
    return probe.reference === existing.reference ? 'likely' : 'none';
  }
  if (
    probe.valueDate === existing.valueDate &&
    normalizeDescription(probe.description) === normalizeDescription(existing.description)
  ) {
    return 'likely';
  }
  return 'possible';
}

/** Existing transactions on the same account with the same type and amount, near the date. */
export async function findDuplicateCandidates(
  db: Executor,
  params: {
    accountId: string;
    type: Candidate['type'];
    amount: string;
    from: string;
    to: string;
    excludeId?: string;
  },
): Promise<Candidate[]> {
  const filters: SQL[] = [
    eq(transactions.accountId, params.accountId),
    eq(transactions.type, params.type),
    eq(transactions.amount, params.amount),
    between(
      transactions.valueDate,
      addDays(params.from, -DUPLICATE_WINDOW_DAYS),
      addDays(params.to, DUPLICATE_WINDOW_DAYS),
    ),
    isNull(transactions.deletedAt),
  ];
  if (params.excludeId) filters.push(ne(transactions.id, params.excludeId));
  return db
    .select()
    .from(transactions)
    .where(and(...filters))
    .limit(20);
}
