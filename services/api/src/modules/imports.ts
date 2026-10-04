import { Router } from 'express';
import { and, between, eq, inArray, isNull } from 'drizzle-orm';
import {
  addDays,
  importCommitInput,
  importPreviewInput,
  normalizeDescription,
  toMoneyString,
  type DuplicateLevel,
  type ImportCommitResponse,
  type ImportPreviewResponse,
  type ImportPreviewRow,
  type ImportRow,
} from '@smartfin/shared';
import { recordAudit } from '../audit';
import type { DatabaseHandle, Executor } from '../db/client';
import { isUniqueViolation } from '../db/errors';
import { importBatches, transactions } from '../db/schema';
import { ctxOf, type Ctx } from '../http/context';
import { badRequest } from '../http/errors';
import { classifyDuplicate, DUPLICATE_WINDOW_DAYS } from './duplicates';
import { usableAccount } from './shared';
import { checkCategory } from './transactions';

const IDEMPOTENCY_KEY = /^[\w-]{8,128}$/;
const RANK: Record<DuplicateLevel, number> = { none: 0, possible: 1, likely: 2 };

interface NormalizedRow {
  rowNumber: number;
  valueDate: string;
  type: 'income' | 'expense';
  amount: string;
  description: string | null;
  reference: string | null;
}

function normalize(row: ImportRow): NormalizedRow {
  const amount = toMoneyString(row.amount);
  const negative = amount.startsWith('-');
  return {
    rowNumber: row.rowNumber,
    valueDate: row.valueDate,
    type: negative ? 'expense' : 'income',
    amount: negative ? amount.slice(1) : amount,
    description: row.description ?? null,
    reference: row.reference ?? null,
  };
}

const dayNumber = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/**
 * Flags rows that look like transactions already on the account, or like an earlier row in the
 * same file (statements sometimes repeat lines across page breaks).
 */
async function detectDuplicates(
  db: Executor,
  accountId: string,
  rows: NormalizedRow[],
): Promise<ImportPreviewRow[]> {
  const dates = rows.map((r) => r.valueDate).sort();
  const existing = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        inArray(transactions.type, ['income', 'expense']),
        isNull(transactions.deletedAt),
        between(
          transactions.valueDate,
          addDays(dates[0]!, -DUPLICATE_WINDOW_DAYS),
          addDays(dates.at(-1)!, DUPLICATE_WINDOW_DAYS),
        ),
      ),
    );
  const byAmount = new Map<string, typeof existing>();
  for (const t of existing) {
    const key = `${t.type}|${toMoneyString(t.amount)}`;
    byAmount.set(key, [...(byAmount.get(key) ?? []), t]);
  }

  const seenInFile = new Set<string>();
  return rows.map((row) => {
    let duplicate: DuplicateLevel = 'none';
    let matchTransactionId: string | null = null;
    for (const t of byAmount.get(`${row.type}|${row.amount}`) ?? []) {
      if (Math.abs(dayNumber(t.valueDate) - dayNumber(row.valueDate)) > DUPLICATE_WINDOW_DAYS) {
        continue;
      }
      const level = classifyDuplicate(row, t);
      if (RANK[level] > RANK[duplicate]) {
        duplicate = level;
        matchTransactionId = t.id;
      }
    }
    const fileKey = [
      row.type,
      row.amount,
      row.valueDate,
      normalizeDescription(row.description),
      row.reference ?? '',
    ].join('|');
    if (seenInFile.has(fileKey) && duplicate === 'none')
      duplicate = row.reference ? 'likely' : 'possible';
    seenInFile.add(fileKey);
    return { ...row, duplicate, matchTransactionId };
  });
}

export function importsRouter({ database }: { database: DatabaseHandle }): Router {
  const { db } = database;
  const router = Router();

  router.post('/imports/preview', async (req, res) => {
    const ctx = ctxOf(req);
    const input = importPreviewInput.parse(req.body);
    await usableAccount(db, ctx, input.accountId, 'accountId');
    const rows = await detectDuplicates(db, input.accountId, input.rows.map(normalize));
    const body: ImportPreviewResponse = {
      rows,
      counts: {
        total: rows.length,
        likely: rows.filter((r) => r.duplicate === 'likely').length,
        possible: rows.filter((r) => r.duplicate === 'possible').length,
      },
    };
    res.json(body);
  });

  async function replay(ctx: Ctx, key: string): Promise<ImportCommitResponse | null> {
    const [batch] = await db
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.ownerId, ctx.userId), eq(importBatches.idempotencyKey, key)))
      .limit(1);
    return batch
      ? {
          batchId: batch.id,
          imported: batch.rowsImported,
          skipped: batch.rowsSkipped,
          replayed: true,
        }
      : null;
  }

  router.post('/imports/commit', async (req, res) => {
    const ctx = ctxOf(req);
    const key = req.header('idempotency-key');
    if (!key || !IDEMPOTENCY_KEY.test(key)) {
      throw badRequest('Send an Idempotency-Key header (8–128 letters, digits, _ or -).');
    }
    const input = importCommitInput.parse(req.body);
    const previous = await replay(ctx, key);
    if (previous) {
      res.json(previous);
      return;
    }

    try {
      const result = await db.transaction(async (tx) => {
        await usableAccount(tx, ctx, input.accountId, 'accountId');
        const included = input.rows.filter((r) => r.include);
        const checked = new Set<string>();
        for (const row of included) {
          if (!row.categoryId) continue;
          const type = normalize(row).type;
          const cacheKey = `${row.categoryId}|${type}`;
          if (!checked.has(cacheKey)) await checkCategory(tx, ctx, row.categoryId, type);
          checked.add(cacheKey);
        }
        const [batch] = await tx
          .insert(importBatches)
          .values({
            ownerId: ctx.userId,
            accountId: input.accountId,
            fileName: input.fileName,
            idempotencyKey: key,
            rowsTotal: input.rows.length,
            rowsImported: included.length,
            rowsSkipped: input.rows.length - included.length,
          })
          .returning();
        for (let i = 0; i < included.length; i += 500) {
          await tx.insert(transactions).values(
            included.slice(i, i + 500).map((row) => {
              const n = normalize(row);
              return {
                ownerId: ctx.userId,
                type: n.type,
                amount: n.amount,
                valueDate: n.valueDate,
                accountId: input.accountId,
                categoryId: row.categoryId ?? null,
                description: n.description,
                reference: n.reference,
                source: 'import' as const,
                importBatchId: batch!.id,
              };
            }),
          );
        }
        await recordAudit(tx, {
          actorUserId: ctx.userId,
          requestId: ctx.requestId,
          action: 'import.commit',
          entityType: 'import_batch',
          entityId: batch!.id,
          metadata: {
            accountId: input.accountId,
            imported: included.length,
            total: input.rows.length,
          },
        });
        return {
          batchId: batch!.id,
          imported: included.length,
          skipped: input.rows.length - included.length,
          replayed: false,
        } satisfies ImportCommitResponse;
      });
      res.status(201).json(result);
    } catch (err) {
      // A concurrent retry with the same key won the race: return its result.
      const winner = isUniqueViolation(err) ? await replay(ctx, key) : null;
      if (!winner) throw err;
      res.json(winner);
    }
  });

  return router;
}
