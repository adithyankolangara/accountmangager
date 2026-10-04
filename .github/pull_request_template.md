## What and why

<!-- One or two sentences. Link the milestone item or issue. -->

## Checklist

- [ ] Tests added or updated (`npm run check` passes locally)
- [ ] Database changes come with a generated migration in `database/migrations/` that I have read
- [ ] Migration is backwards compatible with the currently deployed API (expand → migrate → contract)
- [ ] Every new endpoint enforces authorization server-side and is covered by an authorization test
- [ ] No secrets, real financial data, raw SMS or personal data in code, fixtures or logs
- [ ] Sensitive actions write audit events
- [ ] Docs updated (`docs/`), and `docs/api/openapi.json` regenerated if the API changed
