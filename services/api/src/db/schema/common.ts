import { sql, type SQL } from 'drizzle-orm';
import { check, numeric, timestamp, type AnyPgColumn } from 'drizzle-orm/pg-core';

/** Instants are timestamptz (stored in UTC). */
export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const timestamps = {
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
};

/** Money is numeric(18,2), read and written as decimal strings. */
export const money = (name: string) => numeric(name, { precision: 18, scale: 2 });

/** CHECK (column IN (...)) for a text column holding one of a fixed set of values. */
export function enumCheck(name: string, column: AnyPgColumn, values: readonly string[]) {
  const list: SQL = sql.raw(values.map((v) => `'${v.replace(/'/g, "''")}'`).join(', '));
  return check(name, sql`${column} in (${list})`);
}
