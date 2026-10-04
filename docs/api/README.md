# SmartFin API documentation

- **Interactive docs:** `/api/docs` on any running API (local: http://localhost:4000/api/docs).
- **OpenAPI 3.1 document:** `/api/v1/openapi.json`, also committed as [`openapi.json`](openapi.json) for review in pull requests.

The document is generated from the Zod schemas in `packages/shared`, the same ones that validate requests, so it can't drift from the implementation. After changing an endpoint or schema, regenerate it:

```powershell
npm run openapi -w services/api
```

CI fails if the committed file is out of date.

## Conventions

| Topic       | Rule                                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Versioning  | All routes live under `/api/v1`. Breaking changes go into `/api/v2`.                                                                                                |
| Amounts     | Decimal **strings** with at most 2 decimals (`"123456.78"`), plus a `currency` code. Never JSON numbers.                                                            |
| Instants    | ISO 8601 UTC (`2026-10-04T10:00:00.000Z`). Financial dates are `YYYY-MM-DD`.                                                                                        |
| Errors      | `{ "error": { "code", "message", "details?", "requestId" } }`. See the `Error` schema.                                                                              |
| Correlation | Send `X-Request-Id` (letters, digits, `.`, `_`, `-`; at most 128 characters) to trace a request. Otherwise the API generates one and returns it in the same header. |
| Rate limits | `RateLimit` / `RateLimit-Policy` headers (IETF draft 8). A 429 returns code `rate_limited`.                                                                         |
| Pagination  | Cursor-based `?limit=&cursor=` (from M2).                                                                                                                           |
| Idempotency | Retry-prone writes accept an `Idempotency-Key` header (from M2).                                                                                                    |
