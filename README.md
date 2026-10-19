# Restaurant POS

Single-outlet restaurant POS and QR table ordering app. The backend uses Next.js Route Handlers, TypeScript, Drizzle, PostgreSQL on Neon, and Neon Auth. The local `docs/` folder contains the detailed design and is intentionally excluded from Git.

## Local development

```bash
npm ci
npm run dev
```

Open <http://localhost:3000>. Customer QR ordering, cashier operations and the owner workspace are available. Both the exclusive owner and cashiers use `/login`; the account's stored role determines the workspace. Old `/owner-login` links redirect to `/login`.

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Contracts, Auth guards, and business calculations live in `src/lib/`; database schema and connection live in `src/db/`; versioned migrations live in `drizzle/`. Keep a separate copy of the local `docs/` folder if you need its API contract and ERD after cloning.

## Neon setup

Work on Git `main` with the existing Neon `production` link. Treat its data as disposable development/demo data until release; review migrations and take a backup before changing the schema. Run destructive integration tests against local PostgreSQL, not the linked Neon database. `.env.local` and `.neon` are Git-ignored; keep credentials in server-side environment variables and never prefix them with `NEXT_PUBLIC_`.

Copy `.env.example` to `.env.local` and fill the server-only values. `DATABASE_URL` is for app queries; `DATABASE_URL_UNPOOLED` is for migrations and seed data. **Check both URLs before running a migration or seed**. For a fresh local PostgreSQL database, create the minimal Auth table before the app migrations:

```powershell
psql -h 127.0.0.1 -U postgres -d postgres -v ON_ERROR_STOP=1 -f scripts/db/local-auth-stub.sql
```

Point both database URLs in `.env.local` at that local database, then run:

```bash
npm run db:migrate
npm run db:seed
npm run db:health
```

The seed adds fictional menu items, tables, and settings and can be repeated. To seed staff profiles, first create the two matching Neon Auth users, then set `SEED_ADMIN_USER_ID` and `SEED_CASHIER_USER_ID`. The local Auth stub exists only to satisfy the staff foreign key during local database tests; it does not authenticate users.

## Staff authentication (BE-03)

Neon Managed Auth is proxied at `/api/auth/*`; the browser SDK is in `src/lib/auth/client.ts`. Email/password sign-in, sign-out, and session requests use that SDK. Everyone signs in at `/login`, then `GET /api/me` verifies the session and an active, non-deleted `staff_profiles` row to resolve the account role. Owners go to `/admin/reports`; cashiers go to `/pos`. Role selection or query parameters cannot change access. `/api/staff/me` still requires `CASHIER` and `/api/admin/me` requires `ADMIN`; the roles cannot use each other's workspace or APIs. The owner creates cashier accounts and public signup stays closed. Future staff and admin handlers must call `requireStaff(request)` or `requireAdmin(request)` before reading or changing protected data; those guards also reject cross-origin mutations. `requireAccount` is for identity discovery only, not role-specific operations.

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
The initial `admin@saji.id` account has both the application `ADMIN` profile and Neon Auth `admin` role on the linked production branch. The latter allows the server to provision Cashier Auth users. Browser requests to `/api/auth/admin/*` are blocked; account changes go through audited `/api/admin/staff/*` routes.

## Customer access (BE-05)

Set `CUSTOMER_TOKEN_SECRET` to a separate random secret of at least 32 bytes on the app host. This workspace has one in `.env.local`; create a new one on a fresh clone. Never expose it with `NEXT_PUBLIC_`. Public table metadata is available at `/api/public/tables/{tableToken}`. A guest submits a name to `/guests` and sends the returned bearer token to `/menu`. Guest tokens expire after two hours. `POST /api/public/tables/{tableToken}/orders` uses that guest token to create or join an active table session, snapshots menu prices, and returns an order view token. The `/api/public/orders/{orderId}` status route requires that order-scoped token, valid for 24 hours.

The HTTP integration test needs the local app and PostgreSQL running with the same `CUSTOMER_TOKEN_SECRET`. Set `TEST_DATABASE_URL` and `TEST_API_BASE_URL` to their localhost URLs before `npm test`.
To run the optional BE-03 role test as well, set `TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` for an existing Neon Auth login. The test uses only temporary role profiles in local PostgreSQL and signs out afterward; it does not change the production staff profile.

## Backend API map

| Area | Routes | Access |
|---|---|---|
| Table QR, guest, menu, checkout, order status | `/api/public/tables/*`, `/api/public/orders/*` | Public with scoped guest or order token where required |
| Table overview, order progress, bill, payment, receipt | `/api/staff/tables/*`, `/api/staff/orders/*`, `/api/staff/order-items/*`, `/api/staff/table-sessions/*`, `/api/staff/payments/*` | Active Cashier only |
| Reservation and check-in | `/api/staff/reservations/*` | Active Cashier only |
| Categories, menus, tables, billing settings | `/api/admin/categories/*`, `/api/admin/menus/*`, `/api/admin/tables/*`, `/api/admin/settings/*` | Active Admin |
| Staff and Paid-only reports | `/api/admin/staff/*`, `/api/admin/reports/*` | Active Admin |

The API returns `{ "data": ... }` on success and a typed `{ "error": ... }` on failure. IDs are UUIDs, money is serialized as decimal IDR strings, and restaurant dates use Asia/Jakarta. Public guest-token issuance is limited to 30 requests per minute per table; checkout is limited to 20. A `429` response includes `Retry-After: 60`. Limits are shared by all guests at a table.

## Backend verification

`npm test` runs the unit suite. Integration tests are skipped unless their required environment variables are present. For the database and public HTTP tests, run the local PostgreSQL database and app, then set `TEST_DATABASE_URL`, `TEST_API_BASE_URL`, and `CUSTOMER_TOKEN_SECRET` in the test shell. Both URLs must point to localhost. Run:

```bash
npx vitest run src/db/schema.integration.test.ts src/lib/public/http.integration.test.ts src/lib/checkout.integration.test.ts
```

For staff, payment, reservation, and report HTTP tests, additionally set `TEST_ADMIN_EMAIL` and `TEST_ADMIN_PASSWORD` for an existing Neon Auth account, then run `npm test`. Those tests mutate only `TEST_DATABASE_URL`, never the linked Neon database, and clean up their fixtures. Do not point `TEST_DATABASE_URL` or `TEST_API_BASE_URL` at production. The GitHub workflow is configured to run lint, typecheck, unit tests, build, migration, repeatable seed, database health, and the public HTTP suite against a PostgreSQL service. Auth-backed HTTP tests need the login variables and are run locally.

Application limitations: cash is the only payment method; no split bills, printing, inventory, or online booking. The owner creates cashier email/password in `/admin/staff` and shares credentials privately. Public signup is blocked and the exclusive owner cannot be deactivated. Live Neon credential provisioning and optional reset email delivery still need a deployment smoke test. The per-table public rate limit can temporarily affect other guests at the same table during an abuse burst.

## Interface languages and menu images

Use EN/ID in the page header or staff sidebar to select English or Indonesian. The preference persists in the browser. App controls, messages, reports and receipts are translated; restaurant-entered menu names/descriptions and customer notes stay as written. Amounts remain integer IDR in the API/database; language changes only their display.

Menu management separates filters, dishes and categories. Public, owner and cashier catalogues reuse the same MenuCard. Four bundled white-background illustrations appear for starter menu names when no image URL is supplied; owner photos take precedence. Generated asset paths, prompts and provenance: [menu image notes](public/images/menu/README.md).
