import { CATEGORY_KINDS } from '@smartfin/shared';
import { sql } from 'drizzle-orm';
import { boolean, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { enumCheck, timestamptz } from './common';
import { users } from './users';

/** Built-in categories have no owner; users add their own alongside them. */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: CATEGORY_KINDS }).notNull(),
    name: text('name').notNull(),
    archived: boolean('archived').notNull().default(false),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('categories_owner_kind_name_uq').on(
      sql`coalesce(${t.ownerId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      t.kind,
      sql`lower(${t.name})`,
    ),
    enumCheck('categories_kind_check', t.kind, CATEGORY_KINDS),
  ],
);
