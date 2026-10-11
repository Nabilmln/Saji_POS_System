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

## Staff authentication (BE-03)

Neon Managed Auth is proxied at `/api/auth/*`; the browser SDK is in `src/lib/auth/client.ts`. Email/password sign-in, sign-out, and session requests use that SDK. `/api/staff/me` and `/api/admin/me` verify the session and an active `staff_profiles` row on the server. The admin endpoint also requires the `ADMIN` role. Future staff and admin handlers must call `requireStaff(request)` or `requireAdmin(request)` before reading or changing protected data; those guards also reject cross-origin mutations.

Set `NEON_AUTH_BASE_URL` and a unique `NEON_AUTH_COOKIE_SECRET` (at least 32 characters) in `.env.local` and on the app host. Do not expose the cookie secret to the browser. On the linked Neon `production` branch, public email signup is disabled and the shared Google OAuth provider has been removed. Verify those settings before deploying staff login or after changing Auth configuration:

```bash
neon neon-auth config email-password get --project-id purple-band-68637667 --branch production
neon neon-auth oauth-provider list --project-id purple-band-68637667 --branch production
```

The first Admin Auth user and its `staff_profiles` link have been created on the linked branch. For a fresh database, create the first Auth user through a trusted Neon operation. Set `BOOTSTRAP_ADMIN_USER_ID` to its UUID and `BOOTSTRAP_ADMIN_NAME` to the desired display name in the server environment, then run the one-time profile link:

```bash
neon neon-auth user create --project-id purple-band-68637667 --branch production --email you@example.com --name "Restaurant Admin"
npm run auth:bootstrap-admin
```

The bootstrap script verifies that the Auth user exists and refuses to create a second admin. It never stores or prints a password. The server guards revalidate privileged sessions with Neon Auth on each request, so a signed-out cookie cannot continue to access staff/admin routes. Do not use public signup for future staff provisioning.
The Neon CLI's user-create command does not accept a password; complete credential setup with Neon Auth before expecting email/password sign-in for a newly created user.
