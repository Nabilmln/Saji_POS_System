# DESIGN.md — Restaurant POS Design System (Working Draft)

> **Purpose:** Working design context for frontend implementation. **Visual choices are proposals**, not approved branding. Functional source of truth: `docs/01-prd-restaurant-pos.md`–`docs/06-api-specification.md`. Interaction source of truth: `docs/07-ui-ux-guidelines.md`. Do not let visual choices change business states, payment rules or role permissions.

## 1. Brand & experience

- Product working name: **Restaurant POS & QR Self-Ordering** (not a final commercial brand).
- Tone: warm, efficient, calm, trustworthy; hospitality on customer mobile, operational clarity on cashier, data precision on admin.
- Design direction: **Modern Hospitality Utility**. Refined and restrained, no generic SaaS gradients or excessive dashboard cards.
- Language: Bahasa Indonesia (`id-ID`). Currency: IDR `Rp25.000`. Timezone: Asia/Jakarta (business configurable).
- Three surfaces: **Customer Mobile**, **Cashier Tablet/Desktop**, **Admin Desktop**.

## 2. Color tokens

Use semantic tokens; exact colors are initial proposals. Validate contrast in actual combinations.

```css
:root {
  --background: #F8FAF9;
  --surface: #FFFFFF;
  --surface-muted: #F1F5F4;
  --foreground: #17212B;
  --text-muted: #52616B;
  --border: #DCE5E2;
  --primary: #0F766E;
  --primary-hover: #115E59;
  --primary-text: #FFFFFF;
  --danger: #B42318;
  --warning: #B45309;
  --info: #1D4ED8;
  --success: #047857;
  --reserved: #6D28D9;
  --focus-ring: #0F766E;
}
```

Status mappings **must not drift**:

| Meaning | Indonesian label | Token/style intent |
|---|---|---|
| Order `PENDING` | Menunggu konfirmasi | amber/warning |
| Order `PREPARING` | Sedang disiapkan | info/blue |
| Order `SERVED` | Sudah disajikan | success/green |
| Table `AVAILABLE` | Tersedia | success/green |
| Table `OCCUPIED` | Terisi | slate/blue, clearly non-available |
| Table `RESERVED` | Direservasi | reserved/violet |
| Payment `PAID` | Lunas | success/green |
| Payment unpaid | Belum dibayar | neutral/warning |
| Void | Dibatalkan | muted/danger explanatory text |

**Never rely on color alone.** Always add label + contextual icon where useful.

## 3. Typography

- Font stack: `Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif` (fallback acceptable).
- Page headings: 28–32px desktop, 24–28px mobile; semibold/bold.
- Card headings: 18–20px; semibold.
- Body: 14–16px; customer base 16px preferred.
- Labels and captions: 12–14px (12 for secondary annotations only).
- Line height: 1.4–1.6 for body; 1.2–1.3 for headings.
- Money and metrics: `font-variant-numeric: tabular-nums`; right-aligned in financial rows.
- Never make key order-status labels, totals, or controls tiny.

## 4. Spacing, radius and layout

- Spacing scale: `4, 8, 12, 16, 24, 32, 40, 48` CSS px.
- Cards: 16–24px padding, 12–16px corner radius.
- Inputs/buttons: 10–12px vertical padding, 8px radius.
- Borders: 1px solid `--border`; subtle shadows only for overlays/floating headers.
- Touch targets: ~44×44 CSS px minimum for mobile / cashier controls.
- Customer content max width: 720px; customer mobile at 360–430px.
- Cashier/admin main content max width: 1440px; sidebar 220–248px, responsive collapsible.
- Primary breakpoint review: 360, 390, 768, 1024 and 1440px.
- Separate layout shells for customer / cashier / admin while sharing primitives.

## 5. Components and states

**Shared primitives:** Button (primary/secondary/destructive/disabled/loading), Input, Select, Checkbox, Toggle, Badge, Card, Modal/Dialog, Toast/InlineAlert, Tabs/FilterChips, Skeleton, EmptyState, DataTable, SearchInput, MoneyDisplay, ErrorMessage.

**Domain components:** TableTile, OrderStatusBadge, MenuCard, QuantityStepper, StickyCartAction, OrderCard, ServedChecklistRow, LiveBillBreakdown, CashPaymentForm, ReceiptPreview, QRTemplateCard, CustomSVGRevenueChart.

For every significant component: show **default, hover/focus, loading, disabled, error, and success/selected** states where relevant. The interface must tolerate very long Indonesian copy and different currency lengths. Confirmation required for irreversible actions.

## 6. Motion & feedback

- 120–200ms functional transitions; no showy dashboard animations.
- Respect `prefers-reduced-motion`.
- Loading uses skeleton or disabled button + spinner, not visual jumping.
- Real-time-ish updates via polling (~3–5s) should be discreet; show offline / retry indicators.
- Bill changes on unpaid sessions should trigger nonblocking inline notice; payment attempts with stale quote **must stop** and require cashier re-review.
- Never animate a payment success before the server confirms Paid.

## 7. Content & voice

- Friendly but concise Indonesian; avoid untranslated technical terms in customer UI.
- Customer CTA: **Lihat Menu**, **Tambahkan ke Keranjang**, **Konfirmasi Pesanan**, **Lihat Status Pesanan**.
- Cashier CTA: **Konfirmasi Pesanan**, **Tandai Sudah Disajikan**, **Bayar Tunai**, **Konfirmasi Pembayaran**, **Lihat Struk Digital**, **Batalkan Item**, **Tutup Sesi Tanpa Pembayaran**.
- Admin CTA: **Tambah Menu**, **Simpan Perubahan**, **Atur Pajak**, **Atur Diskon**, **Unduh QR**.
- Use precise reasons: “Uang diterima kurang dari total tagihan”, “Total tagihan berubah. Periksa kembali sebelum pembayaran”, “Masih ada pesanan yang belum disajikan.”
- Date formatting like `10 Okt 2026, 14.35 WIB` when timezone supports it; always distinguish timestamp from status label.

## 8. Accessibility & inclusive interaction

- Target WCAG 2.2 AA: check contrast, labels, focus, keyboard and zoom; don't claim compliance without testing.
- Visible focus ring; logical reading/tab order; semantic controls and headings.
- Modal focus trap and return focus; status updates announced sparingly.
- Charts have text summaries/accessible data equivalents.
- Mobile sticky buttons do not obscure content or safe areas.
- Icon-only buttons require accessible labels.

## 9. Anti-patterns / product guardrails

**Never design or infer:**
- QRIS/online payment, split bill, refund workflows, cashier shifts, delivery, kitchen display.
- Customer login, password, phone OTP, PIN or customer self-cancel.
- Inventory quantities, stock warnings, ingredients, recipes.
- Extra order statuses beyond Pending / Preparing / Served.
- Extra table statuses beyond Available / Occupied / Reserved.
- Thermal printer, printed receipt button, payment barcode. The receipt is digital preview only.
- Customer access to other guests' item details/name from a shared QR.
- A discount percentage for MVP: discount is **fixed nominal IDR**; tax is **Admin-configured percentage of original subtotal**.
- Revenue from unpaid orders.
- Fake payment success via frontend-only state.

**Critical lifecycle rules:**
1. Customer scans table QR and **enters name before viewing menu**.
2. Customer's confirmed order is Pending; cashier confirmation moves it to Preparing.
3. **Each order-item row** must be marked Served (all its quantity); order becomes Served only after all non-void rows served.
4. Additional orders join the **same active table session and final bill**.
5. **One full cash payment** only when all non-void orders in session are Served; no split bill.
6. Live discount/tax settings change unpaid bill; Paid uses **frozen receipt snapshot**.
7. Successful payment closes session and returns table to Available atomically.
8. Customer cannot cancel; cashier voids with reason; a Served item is voidable before Paid only to correct **employee error**.
9. All-void session closes without payment and without revenue; history remains in audit.
10. Manual reservation created by cashier; no customer self-booking. Auto-open on first customer checkout of Available table is **proposed, not approved**.
