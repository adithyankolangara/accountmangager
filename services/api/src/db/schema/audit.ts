import { index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { timestamptz } from './common';
import { users } from './users';

/**
 * Append-only record of security-relevant and financial actions. Metadata holds safe before/after
 * values only: never passwords, tokens, full account numbers or message text.
 */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** References families(id) once that table exists (M1). */
    familyId: uuid('family_id'),
    action: text('action').notNull(),
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    requestId: text('request_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    index('audit_events_actor_idx').on(t.actorUserId, t.createdAt.desc()),
    index('audit_events_entity_idx').on(t.entityType, t.entityId, t.createdAt.desc()),
  ],
);
