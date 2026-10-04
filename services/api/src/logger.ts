import { pino, type Logger } from 'pino';
import type { Config } from './config';

/** Never log credentials, session tokens or cookies. */
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-smartfin-csrf"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.token',
  '*.sessionToken',
];

export function createLogger(config: Pick<Config, 'env' | 'logLevel' | 'version'>): Logger {
  const pretty = config.env === 'development' && process.stdout.isTTY;
  return pino({
    level: config.env === 'test' ? 'silent' : config.logLevel,
    base: { service: 'smartfin-api', version: config.version },
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(pretty ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
  });
}
