# Saji

Saji is a single-outlet restaurant point-of-sale (POS) and QR table ordering application. It enables contactless dining room ordering for customers while giving cashiers and restaurant owners real-time control over table sessions, manual orders, billing, menu catalogs, and sales performance.

## What you can do

- **Customer QR Ordering**: Guests scan their table QR code, browse dishes and categories, submit orders with item notes directly to the kitchen, and monitor live preparation progress.
- **Cashier POS Operations**: Cashiers track a real-time table grid with a unified search and status filter toolbar, create manual orders via a dedicated POS modal with automated customer-name detection, manage order progression (`Pending` → `Preparing` → `Served`), and settle payments in cash.
- **Table & Reservation Management**: Real-time occupancy tracking, bill previews with tax and service charges, side detail panes for quick edits, and reservation check-in or cancellation.
- **Owner Administration**: Catalog management for dishes and categories with drag-and-drop photo uploads (automatically converted to WebP on cloud storage), table layout setups with printable QR codes, cashier account provisioning, and tax/service settings.
- **Sales Analytics & Reports**: Live sales activity, revenue insights, top-selling items, and daily performance metrics, along with payment transaction history featuring calendar-based date range pickers.
- **Bilingual Interface**: Seamless switching between Indonesian and English across all customer, cashier, and admin interfaces with persistent language preferences.

Saji is designed for in-store single-outlet dining operations with cash settlement. All financial transactions and menu prices are recorded in whole Indonesian rupiah (IDR).

## Tech stack

| Icon | Technology | Role |
| :---: | --- | --- |
| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/nextjs/nextjs-original.svg" width="22" alt="" /> | **Next.js + React** | App Router, Server Actions, Route Handlers, and responsive UI components |
| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/typescript/typescript-original.svg" width="22" alt="" /> | **TypeScript** | Type-safe business contracts, data models, and API schemas |
| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/tailwindcss/tailwindcss-original.svg" width="22" alt="" /> | **Tailwind CSS** | Interface styling, responsive layouts, and restaurant warm-theme design |
| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/postgresql/postgresql-original.svg" width="22" alt="" /> | **Neon PostgreSQL + Drizzle** | Serverless relational database, schema migrations, and Drizzle ORM |
| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/postgresql/postgresql-original.svg" width="22" alt="" /> | **Neon Auth** | Managed authentication with role-based routing (Admin and Cashier) |
| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/amazonwebservices/amazonwebservices-plain-wordmark.svg" width="22" alt="" /> | **Neon Object Storage** | S3-compatible private cloud storage for uploaded menu photos |
| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/vitest/vitest-original.svg" width="22" alt="" /> | **Vitest** | Unit tests, business calculation verification, and API contract tests |

## Workspaces and access

All staff members sign in through the unified `/login` page. The system inspects the account's active role profile and routes users to their respective workspace:

- **Owner / Admin Workspace** (`/admin/reports`): Access to sales analytics, menu and category catalog, dining tables, cashier staff accounts, and store billing settings.
- **Cashier POS Workspace** (`/pos`): Access to table overview, manual order entry, order status progression, bill settlement, reservations, and payment transaction history.
- **Customer Dining Experience** (`/order/{tableToken}`): Accessed by scanning the table's QR code. Guests enter their name, view menu items with starter illustrations or owner photos, build their order cart, and submit directly to the POS.

## Set up your own copy

### Prerequisites

- [Node.js 22](https://nodejs.org/) and npm
- A [Neon](https://neon.tech/) account with PostgreSQL, Neon Auth, and an Object Storage bucket

### 1. Get the code and install packages

Clone the repository and install dependencies:

```bash
npm ci
```

### 2. Configure environment settings

Copy `.env.example` to create your local `.env.local` file:

```bash
cp .env.example .env.local
```

Fill in the required server-side environment variables:

| Setting | Description |
| --- | --- |
| `DATABASE_URL` | Pooled Neon PostgreSQL connection string for application queries. |
| `DATABASE_URL_UNPOOLED` | Direct Neon PostgreSQL connection string for migrations and seeding. |
| `NEON_AUTH_BASE_URL` | Base URL for your Neon Auth instance. |
| `NEON_AUTH_COOKIE_SECRET` | Stable random string (at least 32 characters) for signing Auth cookies. |
| `CUSTOMER_TOKEN_SECRET` | Stable random secret (at least 32 characters) for signing customer table tokens. |
| `AWS_ACCESS_KEY_ID` | Access key for Neon Object Storage (S3-compatible). |
| `AWS_SECRET_ACCESS_KEY` | Secret access key for Neon Object Storage. |
| `AWS_ENDPOINT_URL_S3` | S3 endpoint URL for your Neon project storage bucket. |
| `AWS_REGION` | Storage bucket region (e.g., `ap-southeast-1`). |

> To generate secure 32-character secrets, run:
> ```bash
> node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
> ```

### 3. Run migrations and database seed

Apply schema migrations and initialize default store settings:

```bash
npm run db:migrate
npm run db:seed
```

To optionally populate sample dining tables, starter categories, and dishes for testing:

```bash
npm run db:seed -- --demo
```

### 4. Start the application

Launch the local development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. Visiting the root page redirects to `/login`.

## Verification and code quality

Run the test suite and quality checks:

```bash
npm run lint        # Check code quality with ESLint
npm run typecheck   # Typecheck TypeScript codebase
npm test            # Run unit and contract test suites
npm run build       # Build production Next.js application
```
