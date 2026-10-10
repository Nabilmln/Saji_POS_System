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

BE-01 shared request schemas, API envelopes, money strings, and restaurant dates live in `src/lib/`. BE-02 database schema and connection live in `src/db/`, with a versioned migration in `drizzle/`. The [API contract](docs/06-api-specification.md) and [database design](docs/05-database-design.md) describe the intended backend. Feature endpoints are added in later tasks.

## Neon setup

Work on Git `main` with the existing Neon `production` link. Treat its data as disposable development/demo data until release; review migrations and take a backup before changing the schema. Run destructive integration tests against local PostgreSQL, not the linked Neon database. `.env.local` and `.neon` are Git-ignored; keep credentials in server-side environment variables and never prefix them with `NEXT_PUBLIC_`.

Copy `.env.example` to `.env.local` and set the Neon connection URLs. `DATABASE_URL` is for app queries; `DATABASE_URL_UNPOOLED` is for migrations and seed data. Then run:

```bash
npm run db:migrate
npm run db:seed
npm run db:health
```

The seed adds fictional menu items, tables, and settings. It is safe to repeat. To also seed staff profiles, create the two users with Neon Auth first, then set `SEED_ADMIN_USER_ID` and `SEED_CASHIER_USER_ID` to their UUIDs. The integration test needs a local PostgreSQL database with the migration and `scripts/db/local-auth-stub.sql` applied; set `TEST_DATABASE_URL` to its localhost URL before `npm test`.
