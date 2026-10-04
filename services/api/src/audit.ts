import type { Executor } from './db/client';
import { auditEvents } from './db/schema';

export interface AuditInput {
  actorUserId: string | null;
  requestId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  /** Safe values only: never passwords, tokens, full account numbers or message text. */
  metadata?: Record<string, unknown>;
}

/** Writes an audit event, in the caller's database transaction when one is passed. */
export async function recordAudit(db: Executor, input: AuditInput): Promise<void> {
  await db.insert(auditEvents).values({
    actorUserId: input.actorUserId,
    requestId: input.requestId ?? null,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    metadata: input.metadata ?? {},
  });
}

/** Field-level before/after for the listed fields that changed, or null if none did. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: readonly (keyof T & string)[],
): Record<string, { from: unknown; to: unknown }> | null {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of fields) {
    const from = before[field] ?? null;
    const to = after[field] ?? null;
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[field] = { from, to };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}
