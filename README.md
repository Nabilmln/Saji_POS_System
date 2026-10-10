# Restaurant POS

Single-outlet restaurant POS and QR table ordering app. Backend work comes first; feature scope and acceptance criteria are in [the development roadmap](docs/08-development-roadmap.md).

## Local development

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. The current page is the Next.js scaffold; application routes are added in later tasks.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

BE-01 shared request schemas, API envelopes, money strings, and restaurant dates live in `src/lib/`. The [API contract](docs/06-api-specification.md) and [database design](docs/05-database-design.md) describe the intended backend. No database migration or feature endpoint has been implemented yet.

## Neon safety

The Neon CLI currently links this workspace to the `production` branch. Create and select a separate development branch before running migrations, seeds, or mutation tests. `.env.local` and `.neon` are Git-ignored; keep all credentials in server-side environment variables and never prefix them with `NEXT_PUBLIC_`.
