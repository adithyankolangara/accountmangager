import { Router } from 'express';
import type { HealthResponse, ReadinessResponse } from '@smartfin/shared';
import type { DatabaseHandle } from '../db/client';

export interface HealthDeps {
  database: DatabaseHandle;
  version: string;
  expectedMigrations: number;
}

export function healthRouter({ database, version, expectedMigrations }: HealthDeps): Router {
  const router = Router();
  const startedAt = Date.now();

  router.get('/health', (_req, res) => {
    const body: HealthResponse = {
      status: 'ok',
      version,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      time: new Date().toISOString(),
    };
    res.json(body);
  });

  router.get('/health/ready', async (req, res) => {
    const checks: ReadinessResponse['checks'] = { database: 'ok', migrations: 'ok' };
    try {
      await database.ping();
      const applied = await database.appliedMigrationCount();
      if (applied < expectedMigrations) checks.migrations = 'pending';
    } catch (err) {
      req.log.warn({ err }, 'readiness check failed');
      checks.database = 'error';
      checks.migrations = 'error';
    }
    const ready = checks.database === 'ok' && checks.migrations === 'ok';
    const body: ReadinessResponse = { status: ready ? 'ready' : 'not_ready', checks };
    res.status(ready ? 200 : 503).json(body);
  });

  return router;
}
