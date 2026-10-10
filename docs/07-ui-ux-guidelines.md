# 07 — UI/UX Guidelines

**Product:** Restaurant POS & QR-Based Self-Ordering System  
**Version:** 1.1 — UI implementation guidelines
**Date:** 10 Oktober 2026  
**Status:** Proposed design direction; not approved visual identity  
**Audience:** Frontend engineer and product reviewer
**Language:** Bahasa Indonesia (`id-ID`)  
**Primary platform:** Responsive web application

> **Source of truth:** This document translates established product requirements into screen design, interaction, and accessibility guidance. It does **not** override `01-prd-restaurant-pos.md`, `02-business-rules.md`, `03-user-flows.md`, `04-system-architecture.md`, `05-database-design.md`, or `06-api-specification.md`. For reusable design tokens, also read `docs/DESIGN.md`. Resolve conflicts by preferring approved business rules/API contracts over mockup assumptions.

---

## 1. Product experience goals

### 1.1 Experience vision

Create a restaurant experience in which customers order from a table without asking for a menu, cashiers see and handle orders without confusion, and owners can manage the outlet and understand paid revenue. Aim for **fast, calm, obvious interactions**, not a decorative or overly complex dashboard.

**Three separate user experiences, one cohesive system:**

| Audience | Device priority | Primary outcome | UX priority |
|---|---|---|---|
| Customer (public, no login) | Mobile 360–430px | Scan table QR → enter name → choose items → confirm order → track order | Lowest friction, clarity, large touch targets |
| Cashier (staff) | Tablet landscape & desktop | Process orders and table sessions; mark items Served; collect full cash payment | High information density with safe, fast actions |
| Admin (staff) | Desktop-first, tablet usable | Manage menu/tables/staff/settings and inspect paid revenue | Clear data hierarchy, effective management controls |

### 1.2 Experience principles

1. **Table context is always visible.** Show table number on every active customer ordering screen and every cashier order detail/payment screen.
2. **Only show actions the actor can actually perform.** No customer cancellation, customer payment, split bill, kitchen screen, inventory, recipe, or physical receipt printing.
3. **Progressively disclose complexity.** Customer sees minimal controls; cashier sees operational details; admin sees management and analytics.
4. **Make status legible through text + icon/pattern, not color only.** Operational colors must remain consistent throughout the app.
5. **Protect irreversible actions.** Payment, void, deactivate menu, and closing all-void require explicit confirmation or clear safeguards.
6. **Show totals transparently.** Subtotal, fixed discount, tax computed from original subtotal, and final due amount are always separate line items when applicable.
7. **Never pretend local UI state is final payment state.** Successful payments require server confirmation; after Paid the receipt is a frozen historical snapshot.
8. **Use Indonesian interface copy** with `Rp`, `id-ID` grouping, and the business's configured local timezone (default `Asia/Jakarta`).
9. **Build believable production UI.** Specific sample menus and realistic empty/error states, not generic landing-page widgets.

### 1.3 Non-goals and prohibited additions

Do not design QRIS/payment gateway; split bill; customer login or PIN; self-cancel; stock tracking or recipe screens; delivery/takeaway; kitchen display; shift scheduling; multi-outlet switching; loyalty rewards; printer setup/print receipts; or `Completed`, `Accepted`, `Cleaning` statuses. Future-only ideas can appear in documentation but **not** primary MVP screens.

---

## 2. Requirement traceability and design priority

| User flow / requirement | Screens | Priority |
|---|---|---|
| Customer QR, name before menu, cart, checkout | C01–C05 | P0 |
| Order status for a customer | C06 | P0 |
| Cashier table grid, inbox, table detail | K01–K03 | P0 |
| Cashier manual order, served checklist, void | K04–K06 | P0 |
| Live bill, full cash payment, receipt preview | K07–K09 | P0 |
| Staff login & denied access | X01–X02 | P0 |
| Admin menu availability/CRUD | A02–A04 | P0 |
| Admin table & QR management | A05–A06 | P0 |
| Admin live billing configuration | A07 | P0 |
| Cashier manual reservations | K10–K11 | P1 |
| Admin revenue/analytics custom charts | A01 | P1 |
| Admin staff management | A08 | P1 |
| Paid transaction history | K09 | P0 |
| Customer aggregate bill summary | C07 | P1 (minimal: amount only, no other guests' details) |

**Scope definition:** A P0 screen is required for a complete operational demo. P1 screens are important for broader version 1.0, but should not block building the first full order-to-payment flow.

---

## 3. Proposed visual direction

**Design concept: “Modern Hospitality Utility.”** Warm and inviting for customers, efficient and confident for cashiers, precise and analytical for admins. Use a unified brand accent but different density per role.

### 3.1 Mood and attributes

- **Visual adjectives:** welcoming, precise, uncluttered, trustworthy, contemporary.
- **Canvas:** soft off-white (#F8FAF9), surfaces white (#FFFFFF), ink deep slate (#17212B).
- **Brand/action accent:** dark teal (#0F766E) used for primary actions; accessible hover/pressed states.
- **Warm secondary accent:** muted amber (#B45309) for pending/attention.
- **Geometry:** 10–16px radius for common cards and dialogs; 6–8px for controls; do not use pill shapes for everything.
- **Typography:** Inter (free/open) where available with system sans-serif fallback; strong hierarchy and tabular figures for money.
- **Icons:** consistent thin-to-medium line icons (e.g., Lucide), used only when they aid scanning.
- **Imagery:** customer menu photography uses consistent aspect ratio and authentic food shots; keep legibility even when a product has no image.
- **Motion:** short, functional; no distracting entrance animations in cashier workflows.

### 3.2 Color roles (working tokens)

| Token | Value | Application |
|---|---|---|
| `--background` | `#F8FAF9` | page canvas |
| `--surface` | `#FFFFFF` | cards, modals, tables |
| `--surface-muted` | `#F1F5F4` | grouped panels, secondary surfaces |
| `--foreground` | `#17212B` | main text |
| `--text-muted` | `#52616B` | secondary text |
| `--border` | `#DCE5E2` | separators, inputs |
| `--primary` | `#0F766E` | primary CTA, active nav, emphasis |
| `--primary-hover` | `#115E59` | hover/active CTA |
| `--danger` | `#B42318` | destructive actions/validation |
| `--warning` | `#B45309` | pending/attention |
| `--info` | `#1D4ED8` | preparing/informational |
| `--success` | `#047857` | served/available/paid |
| `--reserved` | `#6D28D9` | reserved table status |

Do not assume the hex values automatically meet WCAG text contrast on every background. Verify rendered combinations. Pair semantics with labels and icons. More implementation-ready tokens are in `docs/DESIGN.md`.

### 3.3 Status vocabulary and semantic chips

| Domain | State | Visible Indonesian label | Visual suggestion |
|---|---|---|---|
| Order | `PENDING` | Menunggu konfirmasi | amber + clock icon |
| Order | `PREPARING` | Sedang disiapkan | blue + cooking icon |
| Order | `SERVED` | Sudah disajikan | green + check icon |
| Table | `AVAILABLE` | Tersedia | green + outlined chair/table |
| Table | `OCCUPIED` | Terisi | dark slate/blue + people icon |
| Table | `RESERVED` | Direservasi | violet + calendar icon |
| Payment | unpaid | Belum dibayar | neutral/amber text |
| Payment | paid | Lunas | green + check icon |
| Item | voided (internal) | Dibatalkan | muted text / strike through + reason |
| Menu | `isAvailable=false` | Tidak tersedia | neutral + toggle off |

**Do not introduce additional business statuses through labels** such as Accepted, Done, Completed, or Cleaning. A temporary UI loading state is not an order business status.

---

## 4. Layout, responsive behavior, and navigation

### 4.1 Shared grid and spacing

Use an 8px spacing rhythm; 4px is allowed for small label/icon separation. Standard gaps: 8, 12, 16, 24, 32px. Content max-width: customer 720px; admin/cashier desktop 1440px within responsive gutters.

**Suggested breakpoints:** mobile `<640px`; tablet `640–1023px`; desktop `>=1024px`. Test actual use at 360, 390, 768, 1024, and 1440px, including long Indonesian text.

### 4.2 Customer shell

- Mobile first, edge-safe on phones; sticky compact top bar with brand and **Meja 05**.
- Use bottom sticky cart action when cart has items; do not cover content; account for mobile browser safe areas.
- Category filters scroll horizontally; item cards in one column on narrow phones and two when width allows.
- Bottom sheet is appropriate for quantity/note or product details, but ensure accessible focus management.
- Keep customer checkout short; no shipping address, account prompt, OTP, PIN, or payment method selector.
- Guest-entered name should remain visible but not repeatedly requested in the same active guest flow.

### 4.3 Cashier shell

- Desktop: sidebar 220–248px + header + main content; compact quick-search/filter above table grid.
- Main overview may use split layout: **table grid** (dominant) + **Pending inbox** (secondary).
- Tablet: collapsible sidebar; cards take available width; primary actions remain reachable.
- Mobile fallback: stacked page, not truncated dense tables; drawer/detail route preferred over tiny modal.
- Table detail uses a full page or wide drawer; payment uses a dedicated focused page/modal. Avoid nested modals.
- Persistent table label, session identifier, active order count, payment status, and updated timestamp.

### 4.4 Admin shell

- Desktop-first sidebar with navigation: Dashboard, Menu, Kategori (may live under Menu), Meja & QR, Staff, Pengaturan.
- Reports and staff settings show only for Admin. Do not leak admin navigation into cashier experience.
- Use tables for editable entities; card/grid for items where product images matter. Provide search, filter, pagination if lists grow.
- Chart cards should show readable numerical labels and a comparison context rather than relying on color alone.

### 4.5 Navigation / route mapping

| Route | Screen | Actor |
|---|---|---|
| `/order/[tableToken]` | C01/C02 QR validation → name → catalog | Customer |
| `/order/[tableToken]/cart` | C04 cart and financial preview | Customer |
| `/order/[tableToken]/status` | C06 status of authorized own orders | Customer |
| `/login` | X01 login | Staff |
| `/pos` | K01 table overview / inbox | Cashier |
| `/pos/tables/[tableId]` | K03 table/session details | Cashier |
| `/pos/history` | K09 paid transaction list & receipt preview (proposed route) | Cashier |
| `/pos/payments/[sessionId]` | K08 cash payment | Cashier |
| `/pos/reservations` | K10/K11 manual reservations | Cashier (P1) |
| `/admin` | A01 dashboard | Admin (P1) |
| `/admin/menus` | A02/A03 menu management | Admin |
| `/admin/tables` | A05/A06 table/QR | Admin |
| `/admin/staff` | A08 staff management | Admin (P1) |
| `/admin/settings` | A07 billing toggles | Admin |

Route paths are proposed page architecture; exact API contract remains in `06-api-specification.md`.

---

## 5. Customer screen specifications

### C01 — QR landing and mandatory name

**Entry:** customer scans QR for a specific table.  
**Header:** brand, “Meja 05”, no account menu.  
**Content:** short greeting, table identity, name field, one clear CTA “Lihat Menu”.  
**Form:** `Nama pemesan*`; placeholder “Contoh: Nadia”; simple character length guidance if needed.  
**States:** validating QR; valid table; invalid/expired QR; Reserved or unavailable table state (if rules require); field empty; server error.  
**Behavior:** name **must be submitted before catalog access**; public guest token issued. Name is not authentication or proof of physical presence. No PIN, phone number, OTP, login, or registration.

**Key acceptance:** Guest cannot browse actionable menu/checkout until a valid name is recorded; table identity does not change because of local query manipulation.

### C02 — Menu catalog

**Header:** table identity; guest greeting e.g. “Hai, Nadia”; optional subtle “Pesan tambahan” hint when the session is already in progress.  
**Body:** search by menu name; category chips; food cards (photo, name, short description, price, add button); active menu only.  
**Footer:** sticky cart summary once nonempty; count and amount in `Rp`.

**Menu card rules:** use one consistent image ratio, clear price, and a distinct add action; do not show stock quantities, ingredients/recipes, calories, or menu availability toggles to customers. If photo missing, show a tasteful placeholder.

**States:** loading skeleton; search with results; “Menu tidak ditemukan”; empty category; connection issue; all unavailable. Item made inactive after cart add must be flagged during checkout.

### C03 — Item selection / cart-edit interaction

Can be inline stepper or product bottom sheet. Show photo (optional), name, price, +/- quantity, optional note (if supported), “Tambahkan ke Keranjang”. Minimum quantity 1, never allow negative. Price and totals are preview only; server recalculates during checkout.

### C04 — Cart and checkout review

Display grouped cart items with quantity steppers and removal **from cart only** (this is not cancellation of a submitted order). Each price breakdown must show subtotal, discount amount if enabled, tax rate & value if enabled, and grand total. Primary CTA: **“Konfirmasi Pesanan”**, not “Bayar Sekarang”.

**Formula (illustrative):** `total = subtotal - min(discount, subtotal) + tax(subtotal)`; percent tax is computed from the **original subtotal** before discount, as set in Business Rules. Rate and values from backend; do not permanently hardcode 10%.

If settings changed since preview, refresh figures and ask for re-review only if needed. On submit show processing state; prevent double clicks; if network drops, check submission outcome before allowing retry with idempotency key.

### C05 — Order placed confirmation

Success with table number, order short ID, customer name, visible current `Pending` status, message “Pesanan Anda telah dikirim ke kasir”, and CTA “Lihat Status Pesanan” / “Tambah Pesanan”. Do not imply it is Preparing before cashier confirmation.

### C06 — Own order status

Show **only the order(s) the current guest browser is authorized to view**: order ID, creation time, item summary, status chip, and item served progress when available. Updating may use polling with last refresh indicator. Clear helpful cancellation copy: “Perlu membatalkan pesanan? Silakan hubungi kasir.” Do not display other guests' names/orders merely because they share table/QR.

**Status display:** 3 stages only: Menunggu konfirmasi → Sedang disiapkan → Sudah disajikan. If all-void or a specific order is voided, show a truthful cancellation notice rather than inventing a fourth normal workflow status.

### C07 — Aggregate bill summary (P1)

If implemented, guest sees **combined amount only** and optional breakdown of subtotal, discount, tax, total — no individual items or names of other guests. No payment button or method selection. Endpoint is explicitly optional P1 in API spec.

---

## 6. Cashier screen specifications

### K01 — POS overview: table grid and order inbox

**Top:** outlet label, current signed-in cashier, shift-free navigation, current sync/refresh time, search table.  
**Primary region:** grid of numbered tables; each tile includes table number, status, active session total due, active order count (where relevant), and concise next action.  
**Secondary region:** new `Pending` orders in chronological order; visible count; table number; sender name; timestamp; amount; CTA “Lihat Pesanan”.

**Table tiles:** Available = no active bill; Occupied = active session; Reserved = blocked for walk-in ordering until manual check-in (proposed rule). Do not add Cleaning tile.

**Attention order:** new Pending orders take priority; show restrained notification indicator, never a disruptive dialog per order. The frontend may poll every 3–5 seconds; show graceful reconnection and manual refresh.

### K02 — Incoming orders

Filters: Semua / Pending / Preparing / Served, table, time. Row/card contains order short ID, table, customer name, item count, created timestamp, status, actions permitted. **Confirm** transitions Pending → Preparing; do not add intermediate Accepted.

### K03 — Table/session detail

Persistent header with `Meja 05`, `Occupied`, active session ID (short), and combined bill figure. Group orders under each `ORD-...`; note which are QR and manual. Show order status, customer name if submitted via QR, individual item rows, and a summary of Served progress across entire session.

**Actions:** add manual order, confirm Pending, mark items Served, request void (staff only), view live bill, pay cash when eligible. Payment must stay disabled/guarded while any valid item/order is not Served. Do not automatically mark all other items Served when a single item is checked.

### K04 — Cashier manual order

Menu searchable, category filters, quantity, cart summary, optional customer name or label. Use the same menu images and prices as public ordering; select table context first. Submit creates order per documented API; for MVP direct Preparing for cashier-created orders is **proposed**, not final—design the status display so this policy can change.

### K05 — Served checklist

Inside each Preparing order, each **order-item row** has one checkbox/toggle “Sudah disajikan”. Display quantity explicitly (e.g. `2× Es Teh`); one check represents **all quantity in that row served** for MVP. Show progress `2 dari 3 item`; order automatically switches to Served when all non-void rows are marked. Order can remain Preparing while some items are checked.

Use large click/tap areas and expose an accessible label. Updating remains pending until server acknowledges. If an item is already Served, show its checked state; do not allow casual unmarking unless server-side rules later support correction.

### K06 — Void / cancel confirmation (cashier only)

Provide a dedicated confirmation dialog with target item, quantity, reason (required), warning about recalculation, and destructive CTA “Batalkan Item”. For item not yet Served: normal verified customer request reason. For item already Served: **only employee-error exception**, require reason category “Kesalahan pegawai” and additional explanation; never offer self-service cancellation. No void after Paid. Show resulting item in muted/void appearance and exclude from due total. If everything is void, show “Tutup Sesi Tanpa Pembayaran” with explicit confirmation.

### K07 — Live bill breakdown

Card always uses latest server quote: current subtotal, discount (Rp, when active), tax (% of original subtotal, when active), total due, bill revision, and updated time. Additional order or Admin setting changes should **update the unpaid bill live** without quietly proceeding with an outdated amount. Display a calm inline notice when changed: “Tagihan diperbarui. Periksa total terbaru sebelum pembayaran.”

Avoid rendering a full-screen blocking dialog for every routine polling update; only require explicit reconfirmation at payment if the quote version changes after cashier review. If session is Paid, use receipt snapshot rather than recomputing from global settings.

### K08 — Full cash payment

**Header:** Meja, active session, “Pembayaran Tunai”.  
**Bill summary:** grouped order totals and financial breakdown with a large grand total.  
**Inputs:** `Uang diterima (Rp)`; visible `Kembalian` (never negative). Optionally use quick cash denomination chips if they do not confuse totals.

**Guard:** CTA **“Konfirmasi Pembayaran”** unavailable until ALL non-void orders are Served and amount received ≥ total. Revalidate on backend. Display a final confirmation with table and amount (small safety step). Once sent, disable repeated clicks and show processing state.

**If quote stale:** server rejects the old quote, frontend displays new total and explanation, resets explicit confirmation, and asks cashier to re-check received money. **If success:** show “Pembayaran berhasil”, actual change, and button “Lihat Struk Digital”; backend has already closed session and reset table to Available atomically. Never show success before confirmation response.

### K09 — Transaction history and digital receipt

History table: paid timestamp, transaction ID, source table, amount paid, cashier (if relevant), action “Lihat Detail”. Receipt preview card/modal contains restaurant identity, transaction number/time, table, order lines (with snapshot names/prices/quantities), subtotal, discount, tax, total, cash received, change, and status Lunas.

**No print/print icon/export-to-thermal-printer.** Receipt is on-screen historical preview and must not change if menu price/settings update later.

### K10 — Reservations list (P1)

Cashier enters reservation manually following an external phone/WhatsApp conversation. List name, contact (staff-only), date/time, party size, assigned table, status/cancel controls. Make contact info not visible in customer/admin revenue screenshots; use sensible masking where helpful.

### K11 — Create / check in / cancel reservation (P1)

Form fields: customer name, contact, intended date & time, party size, table (only currently Available), optional notes. Creating reservation marks table Reserved; cashier also marks it physically in restaurant. Check-in moves Reserved to Occupied; cancellation frees the table if safe. No online self-booking, automatic reminders, or automatic expiry UI.

---

## 7. Admin screen specifications

### A01 — Dashboard / paid revenue (P1)

KPI cards: total **paid revenue**, number of paid transactions, average paid transaction, popular items (based on paid sales). Use realistic comparison labels and explicit selected date range. A custom SVG revenue line chart or simple column chart can show daily revenue; use readable axes, dots/tooltips, and an accessible text/table equivalent.

Revenue is based **only on paid payment snapshots**, not Pending/Preparing orders or unpaid bills. Never mix cash received and order amount in different charts without labeling. Include empty state for no paid transactions; avoid false zero trends as if meaningful data exists.

### A02 — Menu management list

Admin can search/filter by category and availability. Show product thumbnail, name, category, price, availability toggle, edit and archive. Toggling Inactive removes product from **customer ordering**; does not affect paid receipt records. No stock count, SKU stock warnings, ingredient cost, or recipe fields.

### A03 — Create/edit menu

Fields: name*, category*, price Rp*, description, photo (if configured), availability on/off. Validation with inline field errors, clear save/cancel actions, image preview, and missing-image fallback. Archive action should use destructive confirmation and never hard delete historical order snapshots.

### A04 — Categories

Small searchable list with add/edit/archive and safeguards for categories still referenced. Can be a tab/subsection of A02 instead of a separate standalone nav item.

### A05 — Table management

Show table number/label, current status, link to QR, management actions. Allow admin to create/rename/deactivate tables subject to active-session constraints. Status `Reserved` is primarily cashier-owned via reservation; do not invent an autonomous planning algorithm.

### A06 — Unique QR template / preview

Show tabletop-printable **QR asset preview** with outlet name placeholder, prominent table number, QR image, and short instruction “Scan untuk memesan”. Buttons may include “Unduh QR (SVG/PNG)” where supported by implementation; **this is QR artwork download, not receipt printing**. Show target URL as secondary read-only data; do not expose secret tokens in analytics or public dashboard charts. Physical print is outside application scope.

### A07 — Billing configuration (live discount/tax)

Two separate toggle rows:

- **Diskon:** enable toggle + *fixed amount in rupiah* field (`Rp`, not percent in MVP).
- **Pajak:** enable toggle + tax percentage field (`%`) configured by Admin; never assume a universal mandatory 10%.

Provide preview sample bill; explicit Save/Apply action, confirmation message: “Perubahan akan memengaruhi tagihan meja yang belum lunas.” When saved, settings version increases and unpaid bills update after refresh/poll; paid historical receipts stay unchanged. Make enabled/disabled controls obvious and differentiate editing unsaved state from applied backend state.

### A08 — Staff access (P1)

List admin/cashier accounts with name, role, active status. Create cashier access and deactivate/reactivate as authorized. Sensitive credentials must never appear in plain text. Admin navigation can expose operational views, but cashier cannot access A08 by typing a direct URL.

---

## 8. Reusable components and interaction variants

Build shared primitives before screen-specific replicas:

| Component | Variants & responsibilities |
|---|---|
| AppShell / Sidebar / TopBar | cashier, admin; active route, current user |
| TableBadge / TableTile | Available, Occupied, Reserved; label, icon, total/count |
| OrderStatusBadge | Pending, Preparing, Served, stable color and text |
| MoneyAmount / BillBreakdown | locale-safe IDR, correct formula, version notice |
| MenuCard / MenuThumbnail | picture fallback, add controls, availability |
| QuantityStepper | min/max logic, keyboard accessible |
| CartSheet / StickyCartCTA | mobile summary with safe-area support |
| ServedChecklistRow | one order-item row, pending/success/error |
| OrderCard / PendingInbox | table, order, guest, timestamp, status |
| SearchInput / FilterChips | accessible clear, empty results, keyboard focus |
| DataTable / Pagination | admin + histories; responsive fallback |
| ConfirmationDialog | irreversible payment, void, archive, all-void close |
| EmptyState / ErrorState / Skeleton | coherent loading, nothing found, network/server errors |
| Toast / InlineAlert | success, non-blocking sync events, actionable errors |
| CashInput / ChangePreview | numeric input, large total, updated quote |
| ReceiptPreview | read-only paid snapshot; no print |
| QRTemplateCard | label, QR artwork, download supported formats |
| ChartFrame / CustomSVGChart | revenue trend; axes, accessible summary, no Recharts |

**Component naming rule:** reuse a single `Badge`, `Dialog`, `Input`, `Button`, `TableTile`, etc. across roles with variants. Prefer feature-local composed components to duplicate global primitives.

### 8.1 Buttons and hierarchy

- Primary: one strongest next action per surface (`Konfirmasi Pesanan`, `Konfirmasi Pembayaran`, `Simpan Menu`).
- Secondary: neutral, reversible action (`Kembali`, `Edit`).
- Destructive: red outline/solid only in confirmation surface (`Batalkan Item`, `Nonaktifkan`).
- Disabled state includes explanation when necessary (e.g., why Pay unavailable).
- Interactive control touch targets: approximately 44×44 CSS px minimum for mobile and busy POS surfaces.

### 8.2 Form conventions

Labels always visible (not placeholder-only). Required mark with accessible explanation. Validation on blur/submit, not aggressive validation on every keystroke. Money fields show `Rp` adornment but accept clean numeric data; percentage fields have bounds. Use toast for success and inline field feedback for errors. Preserve user-entered form/cart content on recoverable failures.

### 8.3 Dialog conventions

Use dialog for confirmations and short tasks; use full page for long payment/form tasks, especially on small screens. Focus stays in dialog; return focus to original trigger when closed; Escape should not accidentally mark an irreversible action complete.

---

## 9. Interaction and state matrix (mandatory for generated designs)

| Situation | UI behavior | Sample Indonesian message |
|---|---|---|
| QR invalid | full-page informational error, no menu access | “QR meja tidak valid. Silakan hubungi kasir.” |
| Guest name empty | inline error + focus | “Masukkan nama Anda terlebih dahulu.” |
| Menu no search results | empty result with clear-search | “Menu tidak ditemukan.” |
| Item in cart becomes inactive | preserve cart, mark item, block checkout until adjusted | “Menu ini sudah tidak tersedia. Perbarui keranjang.” |
| Sending order | disabled CTA + spinner | “Mengirim pesanan...” |
| Retry after network drop | check server result before retry | “Memeriksa status pesanan Anda...” |
| New Pending order | inbox count/card update with timestamp | “Pesanan baru dari Meja 05.” |
| Order confirmed | status changes from Pending to Preparing | “Pesanan sedang disiapkan.” |
| Partial Served | progress updates per line; order remains Preparing | “2 dari 3 item telah disajikan.” |
| Payment blocked by unserved item | CTA disabled + reason | “Selesaikan penyajian seluruh item terlebih dahulu.” |
| Live bill changed | refresh amount and display inline notice | “Tagihan diperbarui. Periksa total terbaru.” |
| Insufficient cash | input error, no payment API success | “Uang diterima kurang dari total tagihan.” |
| Payment stale conflict | show new quote and force re-review | “Total tagihan berubah. Periksa kembali sebelum melanjutkan.” |
| Payment duplicate/paid | do not create second payment; navigate to existing record | “Tagihan meja ini sudah dilunasi.” |
| Void served item | require staff-error reason | “Item telah disajikan. Pembatalan hanya untuk koreksi kesalahan pegawai.” |
| All items void | no payment; staff can close session | “Semua item dibatalkan. Tutup sesi tanpa pembayaran?” |
| Reserved table checkout blocked | guidance to staff (proposed policy) | “Meja sedang direservasi. Silakan hubungi kasir.” |
| Lost polling connection | non-blocking banner with retry | “Koneksi terputus. Menghubungkan kembali...” |
| No historical payments | admin/cashier empty state | “Belum ada transaksi lunas pada periode ini.” |
| Staff forbidden | protected page message, back navigation | “Anda tidak memiliki akses ke halaman ini.” |

Design should cover **default, loading, empty, error, success, conflict, and disabled states** for core screens—not only attractive happy-path mockups.

---

## 10. Content, formatting, and privacy

### 10.1 Indonesian microcopy

Use short, action-oriented labels. Prefer **“Konfirmasi Pesanan”**, **“Tandai Sudah Disajikan”**, **“Bayar Tunai”**, **“Konfirmasi Pembayaran”**, **“Lihat Struk Digital”**, **“Batalkan Item”**, **“Tutup Sesi Tanpa Pembayaran”**. Avoid ambiguous “Done”, “Proceed”, “Accept”, “Cancel”, and “Reset” without a noun/context.

### 10.2 Currency and time

- Currency: `Rp25.000`, `Rp150.000`; no fractional rupiah in MVP.
- Tax: `%` visible next to rate, and `Rp` visible next to tax amount.
- Dates: `10 Okt 2026`, times `14.35 WIB`; use locally configured timezone (default Asia/Jakarta).
- IDs: compact display like `ORD-00125`, but maintain stable full ID for internal references.
- Use `font-variant-numeric: tabular-nums` or equivalent for financial tables, card totals, and timestamps.

### 10.3 Privacy-by-design

Only cashier/admin see all orders on a table. Customer sees own authorized order details, not other customers' names or order items; optional bill-summary exposes amount-only. Do not show guest access tokens or raw QR token in UI copies, screenshots, analytics, or logs.

---

## 11. Accessibility, responsive and performance criteria

**Accessibility target:** WCAG 2.2 AA intent for color contrast, keyboard/focus, labels, errors, and assistive technology. Validate with automated checks and manual testing; claiming AA compliance requires testing, not merely following this guide.

- Body text typically >=14–16px; essential button text >=14px; mobile customer base 16px preferred.
- Meaningful semantic headings, form labels, navigation landmarks, and accessible dialogs.
- Visible keyboard focus ring; support Enter/Space for controls; Esc closes noncritical overlays.
- Communicate changing totals and order updates with judicious live announcements (`aria-live`), not noisy repeated notifications.
- Charts use accessible label/summary and underlying numbers/tables; never color-only charts.
- Motion honors `prefers-reduced-motion`; transitions ~120–200ms max for routine state changes.
- Support no food images, long menu names, long currency totals, zoom 200%, slow network.
- Use skeleton only for meaningful load states; avoid layout shift in grid/cards.
- Errors remain readable on small screens; keep CTAs above or visible without obscuring content.

---

## 12. Component-to-data boundaries

- UI consumes API contracts in `06-api-specification.md`; do not invent new public endpoints just to support a design.
- React SVG charts receive pre-aggregated series from `GET /api/admin/reports/revenue` (P1). No Recharts; no need to design charting-library wrappers.
- Dynamic invoice and receipt are **different data sources**: unpaid bill quote vs paid receipt snapshot.
- Cashier `OrderDetail` uses order-item Served checkboxes per API; no order-level “all served” toggle that silently bypasses per-item checks.
- Use polling/refetch for cashier inbox and bill quote; show last-sync text only if useful.
- Never use disabled-only frontend guards in place of server role and payment validation.
- Do not display the order submission as successful until its API succeeds (or idempotent request status is confirmed).

---

## 13. Screen inventory

Each screen should include a **mobile or desktop target, purpose, key widgets, and relevant states**. Use these IDs to keep implementation and review consistent.

| ID | Screen | Viewport baseline | Mandatory content |
|---|---|---|---|
| X01 | Staff Login | 1280 / 390 | username/email, password, role-safe redirect, errors |
| C01 | Customer QR & Name | 390 | table badge, name field, CTA |
| C02 | Menu Catalog | 390 | search, categories, menu cards, cart summary |
| C03 | Item Detail | 390 | quantity, notes if enabled, price, add |
| C04 | Cart & Checkout | 390 | items, subtotal/discount/tax/total, confirm |
| C05 | Checkout Success | 390 | pending status, order ID, next actions |
| C06 | Order Status | 390 | status of own order(s), served progress |
| K01 | POS Overview | 1440 / 1024 | table grid, pending inbox, filters |
| K03 | Table Detail | 1440 / 1024 | grouped orders, items, Served checklist, bill |
| K04 | Manual Order | 1024 | menu search, selections, cart |
| K06 | Void Dialog | 1024 | reason, warning, confirm |
| K08 | Cash Payment | 1024 | latest bill, cash input, change, confirmation |
| K09 | Receipt Preview | 1024 | paid transaction snapshot, no print |
| K10 | Reservation Management (P1) | 1280 | reservations table, create/check-in/cancel |
| A01 | Admin Dashboard (P1) | 1440 | paid revenue KPIs, custom SVG charts |
| A02 | Menu Management | 1440 | search/list, availability toggle, actions |
| A03 | Menu Form | 1024 | name, price, category, description, photo |
| A05 | Table Management | 1440 | statuses, create/edit, QR action |
| A06 | QR Template Preview | 1024 | numbered table QR artwork and download |
| A07 | Billing Settings | 1024 | tax/discount toggles, input and impact notice |
| A08 | Staff Management (P1) | 1440 | list, add/deactivate cashier |
| X02 | Errors / Empty States | mobile+desktop | QR invalid, forbidden, empty, offline, stale quote |

Implement **P0 screens first**, then P1. The IDs are for UI coordination, not backend enums.

---

## 14. Design QA / acceptance checklist

### Functional fidelity

- [ ] Customer enters name **before** seeing menu; no login/PIN.
- [ ] Table number remains visible through ordering; QR unique per table.
- [ ] Customer sees only own authorized order details; cannot self-cancel.
- [ ] Exactly three regular order statuses: Pending, Preparing, Served.
- [ ] Exactly three table statuses: Available, Occupied, Reserved.
- [ ] Additional orders share a table session/bill; NO split bill.
- [ ] Cashier sees separate Served checkbox for each order-item row and quantity.
- [ ] Cash payment CTA guarded by all active orders Served and cash sufficient.
- [ ] On successful cash payment, Paid receipt preview exists and table resets Available.
- [ ] No print receipt controls; no stock/recipe controls.
- [ ] Global fixed discount + configurable percentage tax react to settings for unpaid bills; tax based on initial subtotal.
- [ ] Void only by cashier; Served void exception requires documented staff error.
- [ ] All-void session can be closed without payment; never fake revenue.
- [ ] Admin charts use only Paid financial snapshot data.
- [ ] Staff roles and permitted actions align with API document.

### Design quality

- [ ] Consistent tokens/spacing/type and reusable components across roles.
- [ ] At least one normal, loading, empty, error, and success/conflict state for critical flows.
- [ ] Mobile customer at 360/390px, cashier tablet 1024px, desktop 1440px reviewed.
- [ ] Focus rings, readable contrast, labels, large touch targets, and numeric alignment.
- [ ] No decorative features that imply nonexistent backend capabilities.
- [ ] Realistic Indonesian UI copy, IDs, examples and currency formatting.

---

## 15. Outstanding decisions and assumptions

**OD-01 — Opening table session:** *Not yet explicitly approved*. The proposed policy is that the first successful customer checkout on an Available table opens its Occupied session automatically. At a Reserved table, checkout is blocked until cashier check-in. Do not silently finalize this policy.

**OD-02 — Menu detail notes:** Optional free-text item notes may be included only if backed by adopted API/schema; if not present, do not introduce them in the MVP.

**OD-03 — Visual identity:** Project name/logo, final brand palette and imagery style are provisional. Brand tokens are a **working direction**, not an asserted client identity. Revise them as a system, not screen-by-screen.

**OD-04 — Manual cashier order initial state:** Suggested immediate Preparing remains a proposed policy in PRD; keep implementation adaptable.

**OD-05 — Stale guest state:** Browser with QR/session tokens from a past table cycle must receive accurate recovery copy; do not automatically merge guest orders with a later visitor’s session.

**OD-06 — Tax/legal labels:** Tax percentage and basis reflect admin setup; verify correct commercial/legal wording and rate with the eventual restaurant before production use. This portfolio design must not claim a universal fixed tax rate.

---

## 16. Cross-document links

- `01-prd-restaurant-pos.md` — product goals, priorities, acceptance criteria.
- `02-business-rules.md` — state rules, void, live billing, Paid transition.
- `03-user-flows.md` — role journeys and exception messages.
- `04-system-architecture.md` — modular monolith and page/data boundaries.
- `05-database-design.md` — session/order/item/receipt entities and invariants.
- `06-api-specification.md` — exact endpoint list and role authorizations.
- `docs/DESIGN.md` — visual tokens, components, voice, motion, anti-patterns.

**Definition of done for this document:** A frontend engineer can map every actionable UI element to a documented business rule or API endpoint without inventing unapproved functions.
