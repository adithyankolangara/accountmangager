import { randomUUID } from 'node:crypto';
import express, { type Express } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { API_PREFIX, REQUEST_ID_HEADER } from '@smartfin/shared';
import type { Config } from './config';
import type { DatabaseHandle } from './db/client';
import { errorBody, errorHandler, notFoundHandler } from './http/errors';
import { buildOpenApiDocument } from './openapi';
import { healthRouter } from './routes/health';

export interface AppDeps {
  config: Pick<Config, 'trustProxyHops' | 'rateLimitPerMinute' | 'apiDocsEnabled' | 'version'>;
  logger: Logger;
  database: DatabaseHandle;
  expectedMigrations: number;
}

const SAFE_REQUEST_ID = /^[\w.-]{1,128}$/;

export function createApp({ config, logger, database, expectedMigrations }: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxyHops);

  // Correlation id: reuse a well-formed incoming id (e.g. from Render), otherwise generate one.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers[REQUEST_ID_HEADER];
        const id =
          typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
        res.setHeader(REQUEST_ID_HEADER, id);
        return id;
      },
      // Log no headers, IPs or query strings: they can carry personal data or tokens.
      serializers: {
        req: (req: { id: string; method: string; url: string }) => ({
          id: req.id,
          method: req.method,
          path: req.url.split('?')[0],
        }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
      customLogLevel: (_req, res, err) =>
        err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      autoLogging: { ignore: (req) => req.url?.startsWith(`${API_PREFIX}/health`) ?? false },
    }),
  );

  app.use(helmet());

  const health = healthRouter({ database, version: config.version, expectedMigrations });
  app.use(API_PREFIX, health);

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: config.rateLimitPerMinute,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (req, res) => {
        res
          .status(429)
          .json(errorBody('rate_limited', 'Too many requests, slow down', String(req.id)));
      },
    }),
  );

  app.use(express.json({ limit: '1mb' }));

  const openApiDocument = buildOpenApiDocument(config.version);
  app.get(`${API_PREFIX}/openapi.json`, (_req, res) => {
    res.json(openApiDocument);
  });
  if (config.apiDocsEnabled) {
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
