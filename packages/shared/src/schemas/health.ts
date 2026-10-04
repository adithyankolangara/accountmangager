import { z } from 'zod';

export const healthResponse = z
  .object({
    status: z.literal('ok'),
    version: z.string().meta({ example: '0.1.0+3f2a1c9' }),
    uptimeSeconds: z.number().int().nonnegative(),
    time: z.iso.datetime(),
  })
  .meta({ id: 'Health', description: 'Liveness: the API process is running.' });
export type HealthResponse = z.infer<typeof healthResponse>;

export const readinessResponse = z
  .object({
    status: z.enum(['ready', 'not_ready']),
    checks: z.object({
      database: z.enum(['ok', 'error']),
      migrations: z.enum(['ok', 'pending', 'error']),
    }),
  })
  .meta({
    id: 'Readiness',
    description: 'Readiness: the database is reachable and all migrations are applied.',
  });
export type ReadinessResponse = z.infer<typeof readinessResponse>;
