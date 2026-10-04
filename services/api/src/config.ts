import { z } from 'zod';
import pkg from '../package.json' with { type: 'json' };

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    /** PostgreSQL connection string. Without it, the API uses an embedded PGlite database. */
    DATABASE_URL: z
      .string()
      .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgres:// URL')
      .optional(),
    /** PGlite data directory, used only when DATABASE_URL is unset. "memory" keeps nothing on disk. */
    PGLITE_DATA_DIR: z.string().default('.data/pglite'),
    /** Apply pending migrations at startup. Production runs them as a separate deploy step. */
    MIGRATE_ON_START: z.stringbool().optional(),
    /** Number of reverse proxies in front of the API (Vercel rewrite + Render = 2). */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).default(0),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),
    /** Sign-in attempts per IP and email per 15 minutes (sign-ups: per IP per hour). */
    AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),
    /**
     * Comma-separated origins allowed to make cookie-authenticated changes, e.g.
     * "https://smartfin.vercel.app". Unset: only the CSRF token is checked.
     */
    WEB_ORIGINS: z
      .string()
      .optional()
      .transform((v) =>
        (v ?? '')
          .split(',')
          .map((o) => o.trim().replace(/\/$/, ''))
          .filter(Boolean),
      ),
    API_DOCS_ENABLED: z.stringbool().default(true),
    APP_VERSION: z.string().optional(),
    /** Set automatically by Render. */
    RENDER_GIT_COMMIT: z.string().optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.DATABASE_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required in production',
      });
    }
  });

export interface Config {
  env: 'development' | 'test' | 'production';
  port: number;
  logLevel: string;
  database: { url: string } | { pgliteDataDir: string | undefined };
  migrateOnStart: boolean;
  trustProxyHops: number;
  rateLimitPerMinute: number;
  authRateLimit: number;
  webOrigins: string[];
  /** Secure, __Host- prefixed session cookies (HTTPS only). */
  secureCookies: boolean;
  apiDocsEnabled: boolean;
  version: string;
}

export class ConfigError extends Error {
  constructor(issues: z.core.$ZodIssue[]) {
    super(
      'Invalid environment configuration:\n' +
        issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`).join('\n'),
    );
    this.name = 'ConfigError';
  }
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) throw new ConfigError(parsed.error.issues);
  const env = parsed.data;

  const commit = env.RENDER_GIT_COMMIT?.slice(0, 7);
  return {
    env: env.NODE_ENV,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    database: env.DATABASE_URL
      ? { url: env.DATABASE_URL }
      : { pgliteDataDir: env.PGLITE_DATA_DIR === 'memory' ? undefined : env.PGLITE_DATA_DIR },
    migrateOnStart: env.MIGRATE_ON_START ?? env.NODE_ENV !== 'production',
    trustProxyHops: env.TRUST_PROXY_HOPS,
    rateLimitPerMinute: env.RATE_LIMIT_PER_MINUTE,
    authRateLimit: env.AUTH_RATE_LIMIT,
    webOrigins: env.WEB_ORIGINS,
    secureCookies: env.NODE_ENV === 'production',
    apiDocsEnabled: env.API_DOCS_ENABLED,
    version: env.APP_VERSION ?? (commit ? `${pkg.version}+${commit}` : pkg.version),
  };
}
