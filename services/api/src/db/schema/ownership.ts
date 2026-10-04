import { VISIBILITIES } from '@smartfin/shared';
import { integer, text, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { enumCheck } from './common';
import { users } from './users';

export const FAMILY_ACCESS = ['view', 'edit'] as const;

/**
 * Ownership block carried by every financial record (docs/permissions.md). Records are private
 * by default; family sharing (M1) only widens visibility, never ownership.
 */
export const ownershipColumns = () => ({
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** References families(id) once that table exists. */
  familyId: uuid('family_id'),
  visibility: text('visibility', { enum: VISIBILITIES }).notNull().default('private'),
  familyAccess: text('family_access', { enum: FAMILY_ACCESS }).notNull().default('view'),
  /** Optimistic concurrency: every update must send the version it read. */
  version: integer('version').notNull().default(1),
});

export const ownershipChecks = (
  table: string,
  t: { visibility: AnyPgColumn; familyAccess: AnyPgColumn },
) => [
  enumCheck(`${table}_visibility_check`, t.visibility, VISIBILITIES),
  enumCheck(`${table}_family_access_check`, t.familyAccess, FAMILY_ACCESS),
];
