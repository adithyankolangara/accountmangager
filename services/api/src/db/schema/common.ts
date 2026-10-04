import { timestamp } from 'drizzle-orm/pg-core';

/** Instants are timestamptz (stored in UTC). */
export const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

export const timestamps = {
  createdAt: timestamptz('created_at').notNull().defaultNow(),
  updatedAt: timestamptz('updated_at').notNull().defaultNow(),
};
