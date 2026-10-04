import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import { buildOpenApiDocument } from './openapi';

/** Writes the OpenAPI document to docs/api/openapi.json for review and client generation. */
const out = resolve(import.meta.dirname, '../../../docs/api/openapi.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(buildOpenApiDocument(pkg.version), null, 2) + '\n');
console.log(`Wrote ${out}`);
