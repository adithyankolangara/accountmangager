import { Router } from 'express';
import { and, asc, eq, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { categoryInput, categoryUpdate, type Category } from '@smartfin/shared';
import { recordAudit } from '../audit';
import type { DatabaseHandle } from '../db/client';
import { isUniqueViolation } from '../db/errors';
import { categories, transactions } from '../db/schema';
import { ctxOf, type Ctx } from '../http/context';
import { conflict, forbidden, notFound } from '../http/errors';
import { idParam } from './shared';

type CategoryRow = typeof categories.$inferSelect;

const toCategoryDto = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  kind: row.kind,
  system: row.ownerId === null,
  archived: row.archived,
});

const visible = (ctx: Ctx) => or(isNull(categories.ownerId), eq(categories.ownerId, ctx.userId));

const DUPLICATE_NAME = 'A category with this name already exists';

export function categoriesRouter({ database }: { database: DatabaseHandle }): Router {
  const { db } = database;
  const router = Router();

  router.get('/categories', async (req, res) => {
    const ctx = ctxOf(req);
    const { includeArchived } = z
      .object({ includeArchived: z.stringbool().default(false) })
      .parse(req.query);
    const filters: SQL[] = [visible(ctx)!];
    if (!includeArchived) filters.push(eq(categories.archived, false));
    const rows = await db
      .select()
      .from(categories)
      .where(and(...filters))
      .orderBy(asc(categories.kind), asc(categories.name));
    res.json(rows.map(toCategoryDto));
  });

  router.post('/categories', async (req, res) => {
    const ctx = ctxOf(req);
    const input = categoryInput.parse(req.body);
    const [clash] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          visible(ctx),
          eq(categories.kind, input.kind),
          sql`lower(${categories.name}) = lower(${input.name})`,
        ),
      )
      .limit(1);
    if (clash) throw conflict(DUPLICATE_NAME);
    try {
      const [row] = await db
        .insert(categories)
        .values({ ownerId: ctx.userId, kind: input.kind, name: input.name })
        .returning();
      await recordAudit(db, {
        actorUserId: ctx.userId,
        requestId: ctx.requestId,
        action: 'category.create',
        entityType: 'category',
        entityId: row!.id,
      });
      res.status(201).json(toCategoryDto(row!));
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict(DUPLICATE_NAME);
      throw err;
    }
  });

  async function ownCategory(ctx: Ctx, id: string): Promise<CategoryRow> {
    const [row] = await db
      .select()
      .from(categories)
      .where(and(eq(categories.id, id), visible(ctx)))
      .limit(1);
    if (!row) throw notFound('Category');
    if (row.ownerId === null) throw forbidden('Built-in categories cannot be changed');
    return row;
  }

  router.patch('/categories/:id', async (req, res) => {
    const ctx = ctxOf(req);
    const id = idParam(req.params.id, 'Category');
    const input = categoryUpdate.parse(req.body);
    await ownCategory(ctx, id);
    try {
      const [row] = await db.update(categories).set(input).where(eq(categories.id, id)).returning();
      await recordAudit(db, {
        actorUserId: ctx.userId,
        requestId: ctx.requestId,
        action: 'category.update',
        entityType: 'category',
        entityId: id,
        metadata: { fields: Object.keys(input) },
      });
      res.json(toCategoryDto(row!));
    } catch (err) {
      if (isUniqueViolation(err)) throw conflict(DUPLICATE_NAME);
      throw err;
    }
  });

  /** Deletes an unused category; a category that transactions use is archived instead. */
  router.delete('/categories/:id', async (req, res) => {
    const ctx = ctxOf(req);
    const id = idParam(req.params.id, 'Category');
    await ownCategory(ctx, id);
    const [used] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(transactions)
      .where(eq(transactions.categoryId, id));
    const archived = used!.n > 0;
    if (archived) {
      await db.update(categories).set({ archived: true }).where(eq(categories.id, id));
    } else {
      await db.delete(categories).where(eq(categories.id, id));
    }
    await recordAudit(db, {
      actorUserId: ctx.userId,
      requestId: ctx.requestId,
      action: archived ? 'category.archive' : 'category.delete',
      entityType: 'category',
      entityId: id,
    });
    res.json({ deleted: !archived, archived });
  });

  return router;
}
