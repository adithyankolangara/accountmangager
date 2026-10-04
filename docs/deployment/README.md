# Deploying SmartFin

Production topology: **Vercel** serves the web build and forwards `/api/*` to **Render**, which runs the API and PostgreSQL (see [architecture](../architecture.md)). Deploys run from GitHub Actions after CI passes.

> Nothing here has been run against real accounts yet. Each step needs you to sign in to GitHub, Render or Vercel. If a step doesn't match what you see, the provider's dashboard is the authority; please update this guide.

## 0. Before you start

| You need                                          | Notes                                                                                                                                                 |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub account                                    | Owns the repository and runs CI/CD                                                                                                                    |
| Render account                                    | Region **Singapore** (closest to India)                                                                                                               |
| Vercel account with access to team **adithyan-k** | Hosts the web app                                                                                                                                     |
| Decision on paid plans                            | Free Render Postgres **expires after 30 days with no backups**. See [architecture §5](../architecture.md#5-hosting-constraints-and-costs-to-approve). |

## 1. GitHub repository

1. Create an empty repository (for example `smartfin`, **private**). Don't add a README or licence.
2. Push the local repository:
   ```powershell
   git remote add origin https://github.com/<you>/smartfin.git
   git push -u origin main
   git push -u origin develop
   ```
3. **Settings → Branches → Add rule**, once each for `main` and `develop`:
   - Require a pull request before merging (1 approval).
   - Require status checks: `Lint, typecheck, test, build` and `Dependency audit and secret scan`.
   - Block force pushes.
4. **Settings → Environments → New environment `production`**. Add yourself as a required reviewer, so every production deploy waits for approval. Restrict it to the `main` branch.
5. **Settings → Code security:** enable Dependabot alerts and secret scanning.

## 2. Render (API + database)

1. Render dashboard → **New → Blueprint** → connect GitHub → pick the repository. Render reads [`render.yaml`](../../render.yaml) and proposes:
   - `smartfin-db`: PostgreSQL 17, Singapore, plan **free**
   - `smartfin-api`: Node web service, Singapore, plan **free**, health check `/api/v1/health/ready`
2. Apply. The first deploy runs `npm ci && npm run build -w services/api`, starts the API, applies migrations (`MIGRATE_ON_START=true`) and waits for the readiness check.
3. Note the service URL, for example `https://smartfin-api.onrender.com`. **If Render gave the service a different hostname,** change the rewrite destination in [`apps/web/vercel.json`](../../apps/web/vercel.json) to match and commit it.
4. Check it: open `https://<api-host>/api/v1/health/ready`. You should get `{"status":"ready",...}`. API docs are at `/api/docs`.
5. **smartfin-api → Settings → Deploy Hook:** copy the URL. In GitHub (**Settings → Secrets and variables → Actions**) add:
   - Secret `RENDER_DEPLOY_HOOK_URL`: the deploy hook URL.
   - Variable `API_BASE_URL`: `https://<api-host>` (not secret).

### When you move to paid plans (needs approval)

- Database: choose a paid plan in Render. That gives daily backups, plus point-in-time recovery on higher tiers.
- API: choose a paid instance (no sleeping). Then in `render.yaml`, uncomment `preDeployCommand`, set `MIGRATE_ON_START` to `'false'` and sync the blueprint. Migrations then run once per deploy, before traffic switches.

## 3. Vercel (web)

1. Vercel → **Add New → Project** → import the GitHub repository into team **adithyan-k**.
2. Configure:
   - **Root Directory:** `apps/web`
   - **Framework preset:** Vite (detected from `vercel.json`)
   - Build and install commands: leave the defaults. Vercel detects the npm workspace and installs from the repository root.
   - **Environment variables:** none. The web app has no secrets. Never add server secrets here, because `VITE_*` values are public.
3. Deploy once from the dashboard to check the build, then open the site. The dashboard's **System status** card should say **Operational**, which proves the `/api` rewrite reaches Render.
4. For GitHub Actions deploys, add these repository **secrets**:
   - `VERCEL_TOKEN`: Vercel → Account Settings → Tokens (scope: team adithyan-k).
   - `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`: run `npx vercel link` in the repo root, then copy them from `.vercel/project.json`. That folder is git-ignored; don't commit it.
5. `vercel.json` disables Vercel's own Git deploys for `main` (`git.deploymentEnabled.main = false`). Production then ships only through the gated workflow. Branches and pull requests still get Vercel preview deployments.

## 4. Release flow

```
feature/* ──PR──▶ develop ──PR──▶ main ──▶ Deploy workflow: CI → (approval) → Render → Vercel
                                   └── tag vX.Y.Z ──▶ Release workflow: CI → GitHub release
```

- `deploy.yml` triggers the Render deploy hook for the exact commit. It waits until `/api/v1/health` reports that commit (`version` ends in `+<sha7>`) and the API is ready, then builds and deploys the web app with the Vercel CLI. The API goes first, so the web app never calls an API older than itself.
- To cut a release:
  ```powershell
  git checkout main; git pull
  git tag -a v0.1.0 -m "M0 foundation"
  git push origin v0.1.0
  ```

## 5. Domains and HTTPS

- **Web:** Vercel → Project → Settings → Domains → add for example `app.example.in`, then create the DNS record Vercel shows. The certificate is issued automatically.
- **API:** no public custom domain is needed, because browsers reach it through the Vercel origin. The Android app (M5) calls Render directly. Optionally add `api.example.in` under Render → Settings → Custom Domains (automatic TLS), then update `vercel.json`.
- HSTS and the other security headers are set in `vercel.json` (web) and by Helmet (API).

## 6. Environment variables

### API (Render)

| Variable                | Required | Default                           | Secret  | Purpose                                                              |
| ----------------------- | :------: | --------------------------------- | :-----: | -------------------------------------------------------------------- |
| `NODE_ENV`              |   yes    | `development`                     |   no    | `production` on Render                                               |
| `DATABASE_URL`          |   prod   | —                                 | **yes** | Set automatically from `smartfin-db` (internal URL, private network) |
| `PORT`                  |    no    | `4000`                            |   no    | Render injects its own                                               |
| `MIGRATE_ON_START`      |    no    | `true` (non-prod), `false` (prod) |   no    | Blueprint sets `true` for the free plan                              |
| `TRUST_PROXY_HOPS`      |    no    | `0`                               |   no    | `2` behind Vercel + Render (correct client IP for rate limiting)     |
| `RATE_LIMIT_PER_MINUTE` |    no    | `300`                             |   no    | Per client IP, health checks excluded                                |
| `API_DOCS_ENABLED`      |    no    | `true`                            |   no    | Serves Swagger UI at `/api/docs`                                     |
| `LOG_LEVEL`             |    no    | `info`                            |   no    | `fatal` … `trace`                                                    |
| `APP_VERSION`           |    no    | package version + Render commit   |   no    | Override the reported version                                        |
| `PGLITE_DATA_DIR`       |    no    | `.data/pglite`                    |   no    | Local development only                                               |

### GitHub Actions

| Name                                                 | Kind     | Used by                                |
| ---------------------------------------------------- | -------- | -------------------------------------- |
| `RENDER_DEPLOY_HOOK_URL`                             | secret   | deploy.yml                             |
| `API_BASE_URL`                                       | variable | deploy.yml (waits for the new version) |
| `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | secrets  | deploy.yml                             |

### Web (Vercel)

None in production. `VITE_API_BASE_URL` is used only by the Android build (M5).

## 7. Database migrations

- Migrations are plain SQL in `database/migrations/`, generated by `npm run db:generate` from `services/api/src/db/schema`. They're reviewed in the pull request like code. CI fails if the schema changes without a migration.
- **Write migrations to be backwards compatible** (expand → migrate → contract). Add new columns as nullable or with defaults; remove or rename only in a later release, once no deployed code uses the old shape. Then the previous API version keeps working if a deploy is rolled back.
- **Run manually** (for example, to check state): Render → smartfin-api → Shell → `npm run db:migrate:prod -w services/api`.
- **Before a risky migration,** take a backup from your machine. Temporarily add your IP to the database's access control, then:
  ```powershell
  pg_dump --format=custom --no-owner --file=smartfin-$(Get-Date -Format yyyyMMdd-HHmm).dump "<external connection string>"
  ```
  Keep the dump encrypted and off shared drives, because it contains personal financial data. Remove your IP afterwards.

## 8. Rollback

| What            | How                                                                                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| API code        | Render → smartfin-api → **Events/Deploys** → pick the last good deploy → **Rollback**. Then fix forward on `main`.                                                                                                                  |
| Web             | Vercel → Project → **Deployments** → last good production deployment → **Instant Rollback** (or **Promote to Production**).                                                                                                         |
| Database schema | Migrations are forward-only. With expand/contract, rolling back the API is enough. If a migration itself is broken, write a corrective migration and deploy it.                                                                     |
| Database data   | Paid plans: Render → smartfin-db → **Recovery** (point-in-time restore or backup restore) into a new database, check it, then repoint `DATABASE_URL`. Otherwise restore your latest `pg_dump` with `pg_restore --clean --no-owner`. |

Disable auto-deploys (the workflow) during an incident: GitHub → Actions → Deploy → **Disable workflow**.

## 9. Staging (from M1)

Plan: a second blueprint instance (`smartfin-api-staging`, `smartfin-db-staging`, synthetic data only) deployed from `develop`. The web build will use a separate Vercel project, deployed with `vercel deploy --local-config vercel.staging.json` (its rewrite points at the staging API). It will be added with M1, when there's data worth testing against.
