import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  type RouteConfig,
} from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  account,
  accountInput,
  accountUpdate,
  API_PREFIX,
  auditEntry,
  category,
  categoryInput,
  categoryUpdate,
  createTransactionResponse,
  demoStatus,
  errorBody,
  healthResponse,
  importCommitInput,
  importCommitResponse,
  importPreviewInput,
  importPreviewResponse,
  incomeSource,
  incomeSourceInput,
  incomeSourceListQuery,
  incomeSourceUpdate,
  readinessResponse,
  reconcileInput,
  sessionResponse,
  signInInput,
  signUpInput,
  summary,
  transaction,
  transactionList,
  transactionListQuery,
  transactionUpdate,
  transactionInput,
  updateProfileInput,
  user,
} from '@smartfin/shared';

type Method = RouteConfig['method'];

interface Endpoint {
  summary: string;
  tag: string;
  body?: z.ZodType;
  query?: z.ZodObject;
  response?: z.ZodType;
  status?: number;
  auth?: boolean;
  headers?: z.ZodObject;
  description?: string;
}

const json = (schema: z.ZodType) => ({ 'application/json': { schema } });
const idParams = z.object({ id: z.uuid() });

export function buildOpenApiDocument(version: string) {
  const registry = new OpenAPIRegistry();
  registry.registerComponent('securitySchemes', 'sessionCookie', {
    type: 'apiKey',
    in: 'cookie',
    name: 'sf_session',
    description:
      'Session cookie set by sign-in (named __Host-sf_session over HTTPS). State-changing requests also need the X-SmartFin-CSRF header.',
  });
  registry.registerComponent('securitySchemes', 'bearer', {
    type: 'http',
    scheme: 'bearer',
    description: 'Session token for the Android app (sign in with X-SmartFin-Client: android).',
  });

  const route = (method: Method, path: string, e: Endpoint) => {
    const hasId = path.includes('{id}');
    const responses: RouteConfig['responses'] = {
      [e.status ?? 200]: e.response
        ? { description: 'Success', content: json(e.response) }
        : { description: 'Success, no content' },
      400: { description: 'Validation failed', content: json(errorBody) },
      ...(e.auth === false
        ? {}
        : { 401: { description: 'Not signed in', content: json(errorBody) } }),
      ...(hasId
        ? { 404: { description: 'Not found (or not yours)', content: json(errorBody) } }
        : {}),
      429: { description: 'Rate limit exceeded', content: json(errorBody) },
    };
    if (method !== 'get' && e.auth !== false) {
      responses[403] = { description: 'Missing or invalid CSRF token', content: json(errorBody) };
    }
    registry.registerPath({
      method,
      path: `${API_PREFIX}${path}`,
      tags: [e.tag],
      summary: e.summary,
      description: e.description,
      security: e.auth === false ? [] : [{ sessionCookie: [] }, { bearer: [] }],
      request: {
        ...(hasId ? { params: idParams } : {}),
        ...(e.query ? { query: e.query } : {}),
        ...(e.headers ? { headers: e.headers } : {}),
        ...(e.body ? { body: { content: json(e.body) } } : {}),
      },
      responses,
    });
  };

  // Operations
  route('get', '/health', {
    summary: 'Liveness check',
    tag: 'Operations',
    response: healthResponse,
    auth: false,
  });
  registry.registerPath({
    method: 'get',
    path: `${API_PREFIX}/health/ready`,
    tags: ['Operations'],
    summary: 'Readiness check (database reachable, migrations applied)',
    responses: {
      200: { description: 'Ready', content: json(readinessResponse) },
      503: { description: 'Not ready', content: json(readinessResponse) },
    },
  });

  // Auth and profile
  route('post', '/auth/signup', {
    summary: 'Create an account and start a session',
    tag: 'Auth',
    body: signUpInput,
    response: sessionResponse,
    status: 201,
    auth: false,
  });
  route('post', '/auth/signin', {
    summary: 'Sign in',
    tag: 'Auth',
    body: signInInput,
    response: sessionResponse,
    auth: false,
  });
  route('post', '/auth/signout', {
    summary: 'Sign out (revokes this session)',
    tag: 'Auth',
    status: 204,
  });
  route('get', '/auth/session', {
    summary: 'Current user and CSRF token',
    tag: 'Auth',
    response: sessionResponse,
  });
  route('patch', '/me', {
    summary: 'Update profile',
    tag: 'Auth',
    body: updateProfileInput,
    response: user,
  });

  // Accounts
  route('get', '/accounts', {
    summary: 'List accounts with calculated balances',
    tag: 'Accounts',
    query: z.object({
      status: z.enum(['active', 'closed', 'all']).optional(),
      kind: z.string().optional().meta({ description: 'Comma-separated kinds, e.g. cash,wallet' }),
    }),
    response: z.array(account),
  });
  route('post', '/accounts', {
    summary: 'Create an account',
    tag: 'Accounts',
    body: accountInput,
    response: account,
    status: 201,
  });
  route('get', '/accounts/{id}', { summary: 'Get an account', tag: 'Accounts', response: account });
  route('patch', '/accounts/{id}', {
    summary: 'Update an account',
    tag: 'Accounts',
    body: accountUpdate,
    response: account,
  });
  route('delete', '/accounts/{id}', {
    summary: 'Delete an account without transactions (otherwise close it)',
    tag: 'Accounts',
    status: 204,
  });
  route('post', '/accounts/{id}/reconcile', {
    summary: 'Record the actual balance and optionally post an adjustment',
    tag: 'Accounts',
    body: reconcileInput,
    response: z.object({ account, difference: z.string(), adjustment: transaction.nullable() }),
  });

  // Categories
  route('get', '/categories', {
    summary: 'Built-in and custom categories',
    tag: 'Categories',
    query: z.object({ includeArchived: z.enum(['true', 'false']).optional() }),
    response: z.array(category),
  });
  route('post', '/categories', {
    summary: 'Create a category',
    tag: 'Categories',
    body: categoryInput,
    response: category,
    status: 201,
  });
  route('patch', '/categories/{id}', {
    summary: 'Rename or archive a category',
    tag: 'Categories',
    body: categoryUpdate,
    response: category,
  });
  route('delete', '/categories/{id}', {
    summary: 'Delete a category (archived instead if in use)',
    tag: 'Categories',
    response: z.object({ deleted: z.boolean(), archived: z.boolean() }),
  });

  // Transactions
  route('get', '/transactions', {
    summary: 'Search and filter transactions (cursor pagination)',
    tag: 'Transactions',
    query: transactionListQuery,
    response: transactionList,
  });
  route('post', '/transactions', {
    summary: 'Create a transaction',
    tag: 'Transactions',
    body: transactionInput,
    response: createTransactionResponse,
    status: 201,
  });
  route('get', '/transactions/{id}', {
    summary: 'Get a transaction',
    tag: 'Transactions',
    response: transaction,
  });
  route('patch', '/transactions/{id}', {
    summary: 'Update a transaction (send the version you read)',
    tag: 'Transactions',
    body: transactionUpdate,
    response: transaction,
  });
  route('delete', '/transactions/{id}', {
    summary: 'Delete (soft; restorable)',
    tag: 'Transactions',
    status: 204,
  });
  route('post', '/transactions/{id}/restore', {
    summary: 'Restore a deleted transaction',
    tag: 'Transactions',
    response: transaction,
  });
  route('get', '/transactions/{id}/history', {
    summary: 'Audit history of a transaction',
    tag: 'Transactions',
    response: z.array(auditEntry),
  });

  // Income
  route('get', '/income-sources', {
    summary: 'Income sources with expected vs received for a month',
    tag: 'Income',
    query: incomeSourceListQuery,
    response: z.array(incomeSource),
  });
  route('post', '/income-sources', {
    summary: 'Create an income source',
    tag: 'Income',
    body: incomeSourceInput,
    response: incomeSource,
    status: 201,
  });
  route('patch', '/income-sources/{id}', {
    summary: 'Update an income source',
    tag: 'Income',
    body: incomeSourceUpdate,
    response: incomeSource,
  });
  route('delete', '/income-sources/{id}', {
    summary: 'Delete an income source',
    tag: 'Income',
    status: 204,
  });

  // Imports
  route('post', '/imports/preview', {
    summary: 'Check statement rows for duplicates before importing',
    tag: 'Imports',
    body: importPreviewInput,
    response: importPreviewResponse,
  });
  route('post', '/imports/commit', {
    summary: 'Import statement rows (idempotent)',
    tag: 'Imports',
    headers: z.object({ 'idempotency-key': z.string().min(8).max(128) }),
    body: importCommitInput,
    response: importCommitResponse,
    status: 201,
    description:
      'Retrying with the same Idempotency-Key returns the first result with replayed: true.',
  });

  // Reports and demo
  route('get', '/reports/summary', {
    summary: 'Income, spending and savings for a date range',
    tag: 'Reports',
    query: z.object({ from: z.iso.date(), to: z.iso.date() }),
    response: summary,
  });
  route('get', '/demo', {
    summary: 'Whether demo data is loaded',
    tag: 'Demo data',
    response: demoStatus,
  });
  route('post', '/demo', {
    summary: 'Load synthetic demo data',
    tag: 'Demo data',
    response: demoStatus,
    status: 201,
  });
  route('delete', '/demo', {
    summary: 'Remove demo accounts and every transaction in them',
    tag: 'Demo data',
    response: z.object({ removed: z.object({ accounts: z.number(), transactions: z.number() }) }),
  });

  route('get', '/openapi.json', {
    summary: 'This OpenAPI document',
    tag: 'Operations',
    response: z.object({}).loose(),
    auth: false,
  });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'SmartFin API',
      version,
      description:
        'Personal and family finance API. Amounts are decimal strings; instants are ISO 8601 UTC; financial dates are YYYY-MM-DD.',
    },
    servers: [{ url: '/' }],
  });
}
