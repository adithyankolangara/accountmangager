import { sql } from 'drizzle-orm';
import { char, check, index, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { timestamps, timestamptz } from './common';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stored lower-cased; uniqueness is case-insensitive by construction. */
    email: text('email').notNull().unique(),
    emailVerifiedAt: timestamptz('email_verified_at'),
    /** Argon2id hash. Null for accounts that only use Google sign-in. */
    passwordHash: text('password_hash'),
    displayName: text('display_name').notNull(),
    preferredCurrency: char('preferred_currency', { length: 3 }).notNull().default('INR'),
    timeZone: text('time_zone').notNull().default('Asia/Kolkata'),
    preferences: jsonb('preferences').$type<Record<string, unknown>>().notNull().default({}),
    ...timestamps,
    deletedAt: timestamptz('deleted_at'),
  },
  (t) => [check('users_email_lowercase', sql`${t.email} = lower(${t.email})`)],
);

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** SHA-256 (hex) of the session token. The token itself is never stored. */
    tokenHash: text('token_hash').notNull().unique(),
    csrfTokenHash: text('csrf_token_hash').notNull(),
    client: text('client', { enum: ['web', 'android'] }).notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
    lastSeenAt: timestamptz('last_seen_at').notNull().defaultNow(),
    idleExpiresAt: timestamptz('idle_expires_at').notNull(),
    absoluteExpiresAt: timestamptz('absolute_expires_at').notNull(),
    revokedAt: timestamptz('revoked_at'),
  },
  (t) => [
    index('user_sessions_user_idx').on(t.userId),
    check('user_sessions_client_check', sql`${t.client} in ('web', 'android')`),
  ],
);
