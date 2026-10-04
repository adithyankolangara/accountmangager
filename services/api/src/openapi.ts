import { OpenAPIRegistry, OpenApiGeneratorV31 } from '@asteasolutions/zod-to-openapi';
import { API_PREFIX, errorBody, healthResponse, readinessResponse } from '@smartfin/shared';

export function buildOpenApiDocument(version: string) {
  const registry = new OpenAPIRegistry();

  registry.registerPath({
    method: 'get',
    path: `${API_PREFIX}/health`,
    tags: ['Operations'],
    summary: 'Liveness check',
    responses: {
      200: {
        description: 'The API process is running',
        content: { 'application/json': { schema: healthResponse } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: `${API_PREFIX}/health/ready`,
    tags: ['Operations'],
    summary: 'Readiness check (database reachable, migrations applied)',
    responses: {
      200: { description: 'Ready', content: { 'application/json': { schema: readinessResponse } } },
      503: {
        description: 'Not ready',
        content: { 'application/json': { schema: readinessResponse } },
      },
    },
  });

  registry.registerPath({
    method: 'get',
    path: `${API_PREFIX}/openapi.json`,
    tags: ['Operations'],
    summary: 'This OpenAPI document',
    responses: {
      200: { description: 'OpenAPI 3.1 document', content: { 'application/json': { schema: {} } } },
      429: {
        description: 'Rate limit exceeded',
        content: { 'application/json': { schema: errorBody } },
      },
    },
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'SmartFin API',
      version,
      description:
        'Personal and family finance API. Amounts are decimal strings; instants are ISO 8601 UTC.',
    },
    servers: [{ url: '/' }],
  });
}
