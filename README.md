# SmartFin

Personal and family finance manager for India: accounts, cash, income and expenses, loans and EMIs, credit cards, chitty, FD/RD, SIPs, gold, budgets, reminders and reports. Each person's records are private unless they choose to share them with their family.

**Status:** M2 (core money) complete: sign-in, accounts, cash and wallets, transactions, income, statement import, reports and demo data. Family sharing (rest of M1) is next. See the [milestone plan](docs/milestones.md).

|          |                                                                      |
| -------- | -------------------------------------------------------------------- |
| Web      | React + TypeScript (Vite), hosted on **Vercel**                      |
| API      | Node 24 + Express 5 + Drizzle, hosted on **Render**                  |
| Database | PostgreSQL (Render); embedded PGlite for local development and tests |
| Android  | Capacitor wrapper around the web app (M5)                            |

## Quick start

Requirements: **Node.js 24** and Git. No database install is needed.

```powershell
npm ci
copy .env.example .env      # optional; the defaults work locally
npm run dev:api             # API on http://localhost:4000 (API docs at /api/docs)
npm run dev:web             # web on http://localhost:5173 (proxies /api to the API)
```

Locally, the API stores data in an embedded PostgreSQL (PGlite) under `services/api/.data/`, and applies migrations when it starts. To use a real PostgreSQL server instead, set `DATABASE_URL` in `.env`.

## Scripts

| Command                           | What it does                                                    |
| --------------------------------- | --------------------------------------------------------------- |
| `npm run check`                   | Everything CI runs: lint, format check, typecheck, tests, build |
| `npm test`                        | Unit and integration tests in all workspaces                    |
| `npm run lint` / `npm run format` | ESLint / Prettier                                               |
| `npm run typecheck`               | TypeScript, no emit                                             |
| `npm run build`                   | Production builds (`services/api/dist`, `apps/web/dist`)        |
| `npm run db:generate`             | Generate a SQL migration from schema changes                    |
| `npm run db:migrate`              | Apply pending migrations to the configured database             |
| `npm run openapi -w services/api` | Regenerate `docs/api/openapi.json`                              |

## Repository layout

```
apps/web/            React web app (also the Android UI, via Capacitor in M5)
services/api/        Express API: config, routes, db schema, migrations runner
packages/shared/     Money (decimal), Indian formatting, dates, Zod API schemas
database/migrations/ Generated SQL migrations (reviewed in PRs)
docs/                PRD, architecture, ERD, permissions, screen map, milestones, deployment
.github/workflows/   CI, deploy (Render + Vercel), release
render.yaml          Render blueprint (API + PostgreSQL)
```

Tests sit next to the code they cover (`*.test.ts`).

## Documentation

- [Product requirements](docs/PRD.md)
- [Architecture and decisions](docs/architecture.md)
- [Data model (ERD)](docs/erd.md)
- [Permission matrix](docs/permissions.md)
- [Screen map](docs/screen-map.md)
- [Milestones](docs/milestones.md)
- [Deployment guide (Vercel + Render)](docs/deployment/README.md)
- [API conventions](docs/api/README.md)

## Contributing

- Branches: `main` (production), `develop` (integration), short-lived `feature/*` and `fix/*`. Merge via pull request with passing CI.
- Never commit secrets, `.env` files, real financial data or real bank messages. Test data is synthetic.
- Money is never a float: use `numeric` in the database, decimal strings on the wire and `decimal.js` in code (`@smartfin/shared`).
