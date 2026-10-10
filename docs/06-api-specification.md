# 06 — API Specification

## Restaurant POS & QR-Based Self-Ordering System

| Metadata | Nilai |
|---|---|
| Versi | **1.1 — BE-01 contract alignment** |
| Tanggal | **10 Oktober 2026** |
| Lokasi repository | `docs/06-api-specification.md` |
| Acuan | PRD v1.2; Business Rules v1.2; User Flows v1.2; System Architecture v1.0; Database Design v1.0 |
| Stack target | Next.js App Router Route Handlers, TypeScript, Zod, Drizzle ORM, Neon PostgreSQL, Neon Managed Better Auth |
| Base path | `/api` (same-origin) |
| Format | JSON UTF-8; `camelCase` untuk payload publik; API database tetap `snake_case` |
| Status | **Rancangan**, tidak menandakan endpoint sudah diimplementasikan |

> **Keputusan bisnis:** pemesanan QR dengan nama wajib (tanpa login/PIN), meja `AVAILABLE|OCCUPIED|RESERVED`, pesanan `PENDING|PREPARING|SERVED`, penyajian per baris item, void oleh kasir, satu sesi aktif per meja, pembayaran penuh **cash**, no split bill, pajak/diskon **live hingga Paid**, preview struk digital dan reservasi manual. **Tidak** ada stok, resep, printer, gateway pembayaran, atau multi-outlet.
>
> **Label:** **Final bisnis** berarti telah disepakati; **Desain API** berarti rekomendasi kontrak; **Terbuka** berarti butuh konfirmasi produk sebelum implementasi tertentu. Nomor dan ID contoh fiktif.

---

## 1. Prinsip dan konvensi API

1. **REST berbasis domain.** UI Customer, Cashier, Admin memakai satu backend modular monolith. Semua operasi mutasi dilakukan **di server**, tidak dari browser langsung ke tabel Neon.
2. **Penghitungan server-side.** Klien **tidak** mengirim subtotal, harga, pajak, diskon, maupun total final. Backend membaca `menu_items` atau snapshot transaksi dan menjalankan `billingService` yang sama.
3. **Uang & versi sebagai string desimal.** Contoh `"150000"`, bukan JSON float; ID dan timestamp merupakan string. Hindari serialisasi `BigInt` mentah dari PostgreSQL/Drizzle.
4. **Tanggal:** `createdAt` / `paidAt` ISO 8601 UTC (`2026-10-10T06:00:00Z`). Filter tanggal laporan dalam kalender restoran **Asia/Jakarta**, diubah ke UTC pada query.
5. **Data historis:** mutasi hanya terhadap sesi aktif. Snapshot `payments.receipt_snapshot` dipakai untuk struk; riwayat Paid tidak dihitung ulang.
6. **Response envelope** standar untuk endpoint aplikasi, **tidak** diberlakukan pada endpoint internal Better Auth dan respons berkas gambar.
7. **CORS:** same-origin. Staff memakai cookie session HttpOnly/Secure/SameSite; mutasi staff wajib perlindungan CSRF atau pemeriksaan `Origin` sesuai framework/auth. Pelanggan tidak menggunakan sesi staff.
8. **Cache:** semua data meja/order/bill/reservasi/setting `Cache-Control: no-store`; menu juga `no-store` atau invalidasi eksplisit agar toggle availability segera berpengaruh.
9. **Rate limit** endpoint publik berdasarkan IP dan token meja, dengan batas terkonfigurasi. Tidak menganggap nama pelanggan sebagai autentikasi.
10. **Idempotency:** checkout dan bayar memiliki request UUID stabil untuk retry; server menyimpan/membandingkan request semantik sebelum mengembalikan replay.

### 1.1 Envelope

Sukses:

```json
{
  "data": { "id": "4c192b0c-a18c-4f14-8912-bcd25aa602d4" },
  "meta": { "requestId": "req_f7e1a" }
}
```

Daftar berpaginasi:

```json
{
  "data": [{ "id": "..." }],
  "meta": { "page": 1, "pageSize": 20, "total": 83, "hasNextPage": true, "requestId": "req_f7e1a" }
}
```

Error:

```json
{
  "error": {
    "code": "BILL_CHANGED",
    "message": "Tagihan berubah. Periksa nominal terbaru sebelum membayar.",
    "details": { "latestQuoteAvailable": true },
    "fields": null
  },
  "meta": { "requestId": "req_f7e1a" }
}
```

`meta.requestId` opsional untuk debugging. `fields` hanya terisi saat error validasi, misalnya `{"customerName":["Nama wajib diisi"]}`. Jangan mengirim stack trace, query SQL, email internal atau token autentikasi pada error publik.

### 1.2 Kode respons

| HTTP | Kegunaan |
|---|---|
| 200 | Read, update, atau replay mutasi idempotent berhasil |
| 201 | Membuat record baru |
| 204 | Menghapus/arsip tanpa body (jika dibutuhkan) |
| 400 | Request rusak (JSON tidak valid, content-type tidak sesuai) |
| 401 | Session/token akses tidak ada atau kadaluwarsa |
| 403 | Role tidak berizin, atau staff nonaktif |
| 404 | Record tidak ditemukan / tidak boleh diketahui pemohon |
| 409 | Status berubah, tab lama, versi tagihan usang, duplikasi, konflik meja |
| 422 | Input terstruktur tidak valid atau cash tidak cukup |
| 429 | Terlalu banyak request; sertakan `Retry-After` bila tersedia |
| 500 / 503 | Kegagalan internal / layanan sementara tidak tersedia |

---

## 2. Autentikasi, akses publik, dan matriks role

### 2.1 Staff authentication (Neon Managed Better Auth; keputusan G-03)

Neon Auth sudah diaktifkan dalam `neon.ts`; aplikasi Next.js akan memasang proxy Managed Auth di `/api/auth/[...path]`. Payload/response login, logout, dan session **mengikuti SDK Neon Auth/Better Auth**, bukan envelope milik kita. Nonaktifkan sign-up baru **pada konfigurasi Neon Auth yang ter-link** sebelum merilis route auth; menyembunyikan tombol sign-up saja tidak cukup. Pengelola membuat admin awal melalui operasi user tepercaya pada Neon yang ter-link, lalu mengaitkan `staff_profiles` dengan ID user tersebut. Akun kasir berikutnya dibuat oleh Admin melalui service server tepercaya. Mekanisme pengiriman kredensial/reset dan kemampuan Admin API yang dipakai diverifikasi pada BE-03; tidak menyimpan password awal di repository atau seed. `staff_profiles` menyimpan role `ADMIN|CASHIER` dan `is_active`.

**Setiap** endpoint `/api/staff/*` dan `/api/admin/*`: validasi sesi server, `staff_profiles.is_active`, lalu role. Admin boleh melakukan operasi cashier. Kasir tidak boleh menggunakan endpoint admin walaupun membuat HTTP request secara manual. `GET /api/staff/me` mengembalikan profil aman tanpa hash password atau token.

**Implementasi BE-03:** proxy `/api/auth/[...path]` menggunakan SDK Neon Auth; `GET /api/staff/me` dan `GET /api/admin/me` memakai guard server yang mengecek profil aktif. Mutasi staff/admin memakai pemeriksaan Origin. Bootstrap pertama memakai CLI Neon Auth dan `npm run auth:bootstrap-admin`; konfigurasi disable signup pada branch Neon wajib diverifikasi sebelum login staff dirilis.

### 2.2 Alur nama pelanggan tanpa login/PIN (desain API)

Tidak perlu PIN dan tidak perlu akun pelanggan. Agar **form nama muncul sebelum katalog** dan akses order personal tetap minimal, gunakan mekanisme ringan:

1. `GET /api/public/tables/{tableToken}` mengembalikan metadata meja/status/siklus, **bukan menu/order orang lain**.
2. `POST /api/public/tables/{tableToken}/guests` menerima `customerName`, mengeluarkan token tamu **bertanda tangan, berumur singkat**, yang memuat `{tableId, cycleNumber, customerName, exp}` tanpa perlu tabel DB baru. Token tamu dikirim via `Authorization: Bearer <guestToken>` di request katalog/checkout.
3. `GET /api/public/tables/{tableToken}/menu` menggunakan token tamu; `POST .../orders` mengikat nama dari token tamu (bukan percaya nilai lain dari browser).
4. Checkout memberi `orderViewToken` bertanda tangan, **hanya** untuk melihat satu order melalui `GET /api/public/orders/{orderId}`. UI dapat menyimpan token terbatas pada tab/browser (mis. sessionStorage) sesuai kebutuhan refresh; jangan taruh di URL, QR, analytics, atau log.
5. Token tamu tidak membuktikan pelanggan berada di restoran. `cycleNumber`, TTL, rate limit, dan konfirmasi kasir memperkecil risiko, **tidak** menghilangkan potensi QR difoto/disebar.

**Catatan implementasi:** token tamu dan order view dapat ditandatangani HMAC/JWT yang diverifikasi server, menggunakan secret terpisah dan TTL. Kontrak ini pilihan teknis untuk mendukung UX nama wajib, bukan penambahan autentikasi pelanggan. Jangan menyebut token tamu sebagai PIN atau pemeriksaan lokasi fisik.

### 2.3 Matriks akses

| Domain | Public guest | Cashier | Admin |
|---|:---:|:---:|:---:|
| Metadata meja, nama, menu tersedia, checkout | ✓ | — | — |
| Status order sendiri | ✓ (order-view token) | ✓ | ✓ |
| Inbox, detail meja, input manual, confirm, served, void | — | ✓ | ✓ |
| Bill internal, cash pay, close all-void, preview struk | — | ✓ | ✓ |
| Reservasi manual dan check-in | — | ✓ | ✓ |
| CRUD master menu/kategori/meja, QR, akun staff | — | — | ✓ |
| Pajak/diskon, revenue keseluruhan | — | — | ✓ |

---

## 3. Endpoint registry (single source of truth)

`P0` = MVP inti; `P1` = fitur penunjang MVP/admin; `P2` = enhancement opsional. Seluruh path diawali `/api`.

### 3.1 Public guest

| Method | Path | Akses | Pri | Tujuan |
|---|---|---|---|---|
| GET | `/public/tables/{tableToken}` | Public | P0 | Identitas nomor meja/status umum/siklus |
| POST | `/public/tables/{tableToken}/guests` | Public | P0 | Nama pemesan → guestToken |
| GET | `/public/tables/{tableToken}/menu` | Guest token | P0 | Kategori dan menu available |
| POST | `/public/tables/{tableToken}/orders` | Guest token | P0 | Checkout pertama / additional order |
| GET | `/public/orders/{orderId}` | Order-view token | P0 | Status order sendiri dan progres item |
| GET | `/public/tables/{tableToken}/bill-summary` | Guest token | P1 | **Hanya agregat nominal**, tanpa item/nama pihak lain |

### 3.2 Staff cashier

| Method | Path | Akses | Pri | Tujuan |
|---|---|---|---|---|
| GET | `/staff/me` | Staff | P0 | Data staff aktif |
| GET | `/staff/tables` | Staff | P0 | Grid meja + total dan sesi aktif |
| GET | `/staff/tables/{tableId}` | Staff | P0 | Detail meja, semua order dan status |
| GET | `/staff/orders` | Staff | P0 | Inbox, filter status `PENDING|PREPARING|SERVED` |
| POST | `/staff/tables/{tableId}/orders` | Staff | P0 | Input order manual |
| POST | `/staff/orders/{orderId}/confirm` | Staff | P0 | `PENDING → PREPARING` |
| PATCH | `/staff/order-items/{itemId}/served` | Staff | P0 | Centang item Served, status order otomatis |
| POST | `/staff/order-items/{itemId}/void` | Staff | P0 | Void dengan alasan + audit |
| GET | `/staff/table-sessions/{sessionId}/bill` | Staff | P0 | Quote current + versi tagihan |
| POST | `/staff/table-sessions/{sessionId}/payments` | Staff | P0 | Cash penuh, Paid, close, reset meja |
| POST | `/staff/table-sessions/{sessionId}/close-all-void` | Staff | P0 | Tutup jika seluruh item void |
| GET | `/staff/payments` | Staff | P0 | Riwayat transaksi (paginasi) |
| GET | `/staff/payments/{paymentId}/receipt` | Staff | P0 | Preview struk digital dari snapshot |
| GET | `/staff/reservations` | Staff | P1 | Daftar reservasi manual |
| POST | `/staff/reservations` | Staff | P1 | Buat reservasi, tandai meja Reserved |
| POST | `/staff/reservations/{id}/check-in` | Staff | P1 | Reserved → Occupied, buat sesi |
| POST | `/staff/reservations/{id}/cancel` | Staff | P1 | Batalkan, status meja Available |

### 3.3 Admin

| Method | Path | Akses | Pri | Tujuan |
|---|---|---|---|---|
| GET / POST | `/admin/categories` | Admin | P1 | List / tambah kategori |
| PATCH / DELETE | `/admin/categories/{id}` | Admin | P1 | Edit / nonaktifkan kategori (terproteksi referensi) |
| GET / POST | `/admin/menus` | Admin | P0 | List termasuk inactive / buat menu |
| GET / PATCH / DELETE | `/admin/menus/{id}` | Admin | P0 | Detail / update / soft archive |
| PATCH | `/admin/menus/{id}/availability` | Admin | P0 | Toggle `isAvailable` |
| GET / POST | `/admin/tables` | Admin | P0 | List / buat meja + QR token |
| PATCH | `/admin/tables/{id}` | Admin | P0 | Edit label/nonaktifkan jika kosong |
| GET | `/admin/tables/{id}/qr` | Admin | P0 | Gambar QR (SVG) atau URL QR |
| GET / POST | `/admin/staff` | Admin | P1 | Daftar / buat akun staff |
| PATCH | `/admin/staff/{userId}` | Admin | P1 | Ganti nama / aktifkan-nonaktifkan staff |
| GET | `/admin/settings/billing` | Admin | P0 | Toggle/nilai diskon-pajak dan version |
| PUT | `/admin/settings/billing` | Admin | P0 | Update atomik + naikkan version |
| GET | `/admin/reports/revenue` | Admin | P1 | Grafik revenue berdasarkan Paid |
| GET | `/admin/reports/top-menus` | Admin | P1 | Menu terlaris dari transaksi Paid |
| POST | `/admin/media/menu-images` | Admin | P2 | Upload gambar aman ke provider media |

**Penamaan:** `/{id}` pada `/admin/*` maupun `/staff/*` harus UUID sesuai ERD; `userId` Neon Managed Auth juga UUID. Jangan membuat endpoint untuk `print`, `refund`, `split-bill`, `stock`, `recipe`, atau payment gateway.

---

## 4. Public guest — kontrak lengkap

### 4.1 `GET /api/public/tables/{tableToken}`

**200**:

```json
{
  "data": {
    "tableId": "1e0a1d6d-830f-4ffd-bbab-7a8cfb5c94ad",
    "tableNumber": "05",
    "status": "AVAILABLE",
    "cycleNumber": 12,
    "requiresName": true
  }
}
```

`404 INVALID_TABLE_TOKEN` bila tidak ada/tidak aktif. `cycleNumber` adalah guard tab QR lama, bukan token keamanan. `RESERVED` tetap boleh menampilkan nomor meja tetapi form checkout harus diblokir sampai kasir check-in. `OCCUPIED` diperbolehkan menambah order pada sesi aktif.

### 4.2 `POST /api/public/tables/{tableToken}/guests`

Body:

```json
{ "customerName": "Aulia", "expectedCycleNumber": 12 }
```

`customerName`: trim, 1–120 karakter, tidak whitespace-only; sanitasi output UI terhadap XSS. Body tanpa nama → `422 VALIDATION_ERROR`. `expectedCycleNumber` harus sama dengan cycle server → `409 TABLE_CYCLE_CHANGED`.

**200**:

```json
{
  "data": {
    "customerName": "Aulia",
    "tableNumber": "05",
    "cycleNumber": 12,
    "guestToken": "<opaque-short-lived-signed-token>",
    "expiresAt": "2026-10-10T08:00:00Z"
  }
}
```

`guestToken` hanya sah untuk tabel/cycle/nama tersebut. TTL usulan 2 jam; atur ulang lewat nama bila kadaluwarsa. Token bukan verifikasi lokasi. Jangan masukkan nilai asli token ke log/analytics.

### 4.3 `GET /api/public/tables/{tableToken}/menu`

Header `Authorization: Bearer <guestToken>`. Query opsional `?q=nasi&categoryId={uuid}`. **200**:

```json
{
  "data": {
    "tableNumber": "05",
    "categories": [
      {
        "id": "e3542d20-3a9b-4cd0-869e-e2dd208673ba",
        "name": "Makanan",
        "items": [
          {
            "id": "c53016f5-d01e-4c66-8bd9-912739776045",
            "name": "Nasi Goreng",
            "description": "Nasi goreng spesial",
            "imageUrl": "https://example.test/images/nasi.jpg",
            "priceIdr": "25000"
          }
        ]
      }
    ]
  }
}
```

Hanya kategori aktif, item `is_available=true` dan belum diarsipkan. `GET` katalog tidak menjamin menu masih tersedia saat checkout; backend revalidasi mutasi.

### 4.4 `POST /api/public/tables/{tableToken}/orders` — checkout QR / additional order

Headers: `Authorization: Bearer <guestToken>`, `Idempotency-Key: <uuid>` (nilai sama dengan `clientRequestKey` sebagai desain). Body:

```json
{
  "expectedCycleNumber": 12,
  "clientRequestKey": "29cd46bc-c351-4512-87a4-8d4e7a416104",
  "note": "Tolong tidak terlalu pedas",
  "items": [
    { "menuItemId": "c53016f5-d01e-4c66-8bd9-912739776045", "quantity": 2, "note": "" },
    { "menuItemId": "8f4e72eb-9658-4df0-ac6e-e497476bf7b4", "quantity": 1 }
  ]
}
```

**Validasi:** minimal satu baris; item ID UUID; qty bilangan bulat 1–99 per baris; item duplikat dalam satu request **ditolak**; note maksimum 500 karakter; nama diambil dari guestToken; tidak menerima harga. `clientRequestKey` UUID wajib dan cocok dengan header bila keduanya dikirim. Server menghitung `request_fingerprint` untuk mendeteksi penggunaan ulang key dengan payload berbeda (lihat §12).

**201**:

```json
{
  "data": {
    "orderId": "7ed215fa-3f23-44b6-a0da-57b2dceea211",
    "sessionId": "c61c1269-8a27-4c5f-8fb1-295cd5a7afe3",
    "tableNumber": "05",
    "customerName": "Aulia",
    "source": "QR",
    "status": "PENDING",
    "items": [
      {
        "id": "ec477eee-67b3-466c-b1a8-87b2d994116d",
        "menuName": "Nasi Goreng",
        "quantity": 2,
        "unitPriceIdr": "25000",
        "lineTotalIdr": "50000",
        "served": false
      }
    ],
    "orderViewToken": "<signed-order-scoped-token>",
    "createdAt": "2026-10-10T06:15:00Z"
  }
}
```

Contoh response item dipersingkat; respons nyata mengembalikan semua baris. `200` saat replay identik dengan key yang sama; `409 IDEMPOTENCY_KEY_REUSED` saat key sama, payload berbeda; `409 MENU_UNAVAILABLE`, `TABLE_RESERVED`, `TABLE_CYCLE_CHANGED` atau `SESSION_NOT_ACTIVE` sesuai kondisi.

**Perilaku sesi:** jika sudah `OCCUPIED`, gunakan sesi aktif. Jika `AVAILABLE`, **baseline usulan (OD-01)** adalah checkout pertama membuat sesi + mengubah meja menjadi `OCCUPIED` dalam transaksi yang sama. Jika belum disetujui, desain dapat diganti menjadi `409 TABLE_NOT_OPEN` sampai kasir membuka sesi. `RESERVED` tidak boleh auto-open publik.

### 4.5 `GET /api/public/orders/{orderId}`

Header `Authorization: Bearer <orderViewToken>`. **200**:

```json
{
  "data": {
    "orderId": "7ed215fa-3f23-44b6-a0da-57b2dceea211",
    "tableNumber": "05",
    "customerName": "Aulia",
    "status": "PREPARING",
    "items": [
      { "menuName": "Nasi Goreng", "quantity": 2, "served": true, "voided": false },
      { "menuName": "Es Teh", "quantity": 1, "served": false, "voided": false }
    ],
    "updatedAt": "2026-10-10T06:21:00Z"
  }
}
```

Saat seluruh item di-void, tampilkan `voided: true` pada data order (metadata; **bukan status keempat**). Jangan mengembalikan daftar nama/order orang lain di meja, kontak reservasi, data staff, atau alasan audit internal.

### 4.6 `GET /api/public/tables/{tableToken}/bill-summary` (P1)

Header guestToken; hanya agregat `subtotalIdr`, `discountIdr`, `taxIdr`, `grandTotalIdr`, `updatedAt`. **Tidak** mengirim daftar order/nama pelanggan lain. Ini informasi sesi bersama: semua pemegang QR dapat melihat nominal meja; tampilkan kebijakan privasi ringkas. Tanpa sesi aktif → `data: null`.

---

## 5. Staff — meja, inbox, order manual

### 5.1 `GET /api/staff/tables`

Query `?status=OCCUPIED&q=05`. **200**:

```json
{
  "data": [
    {
      "id": "1e0a1d6d-830f-4ffd-bbab-7a8cfb5c94ad",
      "tableNumber": "05",
      "status": "OCCUPIED",
      "sessionId": "c61c1269-8a27-4c5f-8fb1-295cd5a7afe3",
      "activeOrderCount": 2,
      "pendingOrderCount": 1,
      "grandTotalIdr": "155000",
      "billRevision": "8"
    }
  ]
}
```

`GET /api/staff/tables/{tableId}` memuat metadata meja, sesi aktif, daftar order dengan `customerName`, item + served/void, status, dan `bill` terbaru. Untuk meja tanpa sesi: `session: null`, `orders: []`, `bill: null`.

### 5.2 `GET /api/staff/orders`

Query: `status`, `tableId`, `source=QR|MANUAL`, `page=1`, `pageSize=20`, `includeVoided=false`. Diurutkan terbaru; default mengecualikan `orders.voided_at IS NOT NULL` dari daftar aktif. Body data memuat `{id, tableId, tableNumber, sessionId, customerName, source, status, itemCount, createdAt}`. Inbox default `status=PENDING`; hak akses staff wajib dicek server.

### 5.3 `POST /api/staff/tables/{tableId}/orders` — pesanan manual

Headers: session staff, `Idempotency-Key: <uuid>`. Body:

```json
{
  "clientRequestKey": "9a32c5b5-79c6-4b3b-abca-190ef3af35a6",
  "customerName": "Pelanggan Meja 05",
  "items": [{ "menuItemId": "c53016f5-d01e-4c66-8bd9-912739776045", "quantity": 1 }],
  "note": "Permintaan langsung ke kasir"
}
```

Server menyimpan `source=MANUAL`, `created_by_user_id` staff. **Desain:** manual order tetap dimulai `PENDING` sehingga transisi/status konsisten; kasir menekan confirm, atau UI menyediakan aksi konfirmasi setelah save. Input harga manual tidak didukung. Pada meja `AVAILABLE`, penginputan manual dapat membuka sesi di transaksi; pada meja `RESERVED`, wajib check-in terlebih dahulu. `201` response setara checkout QR tanpa `orderViewToken`. Idempotency dan locking sama.

### 5.4 `POST /api/staff/orders/{orderId}/confirm`

Body `{}`. Preconditions: sesi aktif; `orders.status=PENDING`; masih ada minimal satu item non-void; staff aktif. Setelah commit, `status=PREPARING`, `acceptedAt`, `acceptedByUserId` terisi. **200**:

```json
{ "data": { "orderId": "7ed215fa-3f23-44b6-a0da-57b2dceea211", "status": "PREPARING", "acceptedAt": "2026-10-10T06:22:00Z" } }
```

Jika sudah Preparing/Served → `409 INVALID_ORDER_TRANSITION` (UI boleh refresh). Tidak ada status Accepted tersendiri.

### 5.5 `PATCH /api/staff/order-items/{itemId}/served`

Body:

```json
{ "served": true }
```

Preconditions: order Preparing atau Served (jika satu item terakhir menuntaskan order, transisi otomatis), sesi aktif dan unpaid, item bukan void, item belum served. Update `served_at`, `served_by_user_id` pada **satu baris** berarti seluruh `quantity` di baris tersebut sudah disajikan. Naikkan `table_sessions.bill_revision`; evaluasi seluruh item non-void. Jika semuanya served, order berubah `SERVED` otomatis. **200**:

```json
{
  "data": {
    "itemId": "ec477eee-67b3-466c-b1a8-87b2d994116d",
    "served": true,
    "servedAt": "2026-10-10T06:35:00Z",
    "orderId": "7ed215fa-3f23-44b6-a0da-57b2dceea211",
    "orderStatus": "SERVED",
    "billRevision": "9"
  }
}
```

**Desain API MVP:** centang satu arah (`served=true`); membatalkan tanda Served karena kekeliruan input tetap **terbuka** (sebaiknya aksi koreksi beralasan + audit, bukan toggling diam-diam). Jangan memakai `status=COMPLETED`.

### 5.6 `POST /api/staff/order-items/{itemId}/void`

Body:

```json
{
  "reasonType": "EMPLOYEE_ERROR",
  "reasonDetail": "Staf salah membawa pesanan ke meja ini"
}
```

`reasonType`: `CUSTOMER_REQUEST` (hanya **sebelum** served) atau `EMPLOYEE_ERROR` (dapat setelah Served, **sebelum** Paid). `reasonDetail` wajib 5–500 karakter (batas desain). Server mengisi `voidedAt`, `voidedByUserId`, reason, mengeluarkan item dari bill, mencatat audit, menaikkan bill revision, dan menetapkan `orders.voided_at` bila tidak ada item non-void tersisa. Jika order Preparing dan seluruh item yang tersisa sudah served, order dapat berubah Served. Jika tidak ada item aktif, order tidak menghalangi pembayaran.

**200**:

```json
{
  "data": {
    "itemId": "ec477eee-67b3-466c-b1a8-87b2d994116d",
    "voided": true,
    "orderVoided": false,
    "billRevision": "10"
  }
}
```

`409 ITEM_ALREADY_SERVED` untuk permintaan biasa setelah Served; `409 ITEM_ALREADY_VOIDED` untuk void kedua; `409 SESSION_NOT_ACTIVE` untuk sesi Paid/Closed. Tidak ada endpoint public cancel.

---

## 6. Bill, pembayaran, dan penutupan sesi

### 6.1 `GET /api/staff/table-sessions/{sessionId}/bill`

Quote **live**, selalu dibangun dari seluruh item non-void + `store_settings` saat request, dari snapshot baca yang konsisten. Tidak boleh memakai total kiriman browser atau quote cache yang usang.

**200**:

```json
{
  "data": {
    "sessionId": "c61c1269-8a27-4c5f-8fb1-295cd5a7afe3",
    "tableId": "1e0a1d6d-830f-4ffd-bbab-7a8cfb5c94ad",
    "tableNumber": "05",
    "sessionRevision": "8",
    "settingsVersion": "4",
    "currency": "IDR",
    "subtotalIdr": "150000",
    "discount": { "enabled": true, "configuredAmountIdr": "10000", "appliedAmountIdr": "10000" },
    "tax": { "enabled": true, "rateBps": 1000, "amountIdr": "15000" },
    "grandTotalIdr": "155000",
    "paymentEligible": false,
    "blockingOrders": [
      { "orderId": "7ed215fa-3f23-44b6-a0da-57b2dceea211", "status": "PREPARING", "unservedItemCount": 1 }
    ],
    "calculatedAt": "2026-10-10T06:40:00Z"
  }
}
```

Rumus final (semua uang integer IDR):

```text
subtotal       = SUM(quantity × unitPriceSnapshot) item non-void dalam sesi
appliedDiscount= discountEnabled ? MIN(discountAmount, subtotal) : 0
taxAmount      = taxEnabled ? ROUND_HALF_UP(subtotal × taxRateBps / 10000) : 0
grandTotal     = subtotal - appliedDiscount + taxAmount
```

Pajak **dari subtotal sebelum diskon**, diskon dan pajak **satu kali per sesi**, additional order masuk ke subtotal. `rateBps=1000` berarti 10%. `sessionRevision` naik saat checkout/served/void; `settingsVersion` naik **setiap** perubahan billing admin (walau total kebetulan sama). Quote Paid bukan live quote: gunakan receipt snapshot.

### 6.2 `POST /api/staff/table-sessions/{sessionId}/payments` — FULL CASH PAYMENT

Header `Idempotency-Key: <uuid>`; Body:

```json
{
  "idempotencyKey": "4c47eeeb-650f-478b-aeb7-c7857397f77a",
  "expectedSessionRevision": "8",
  "expectedSettingsVersion": "4",
  "cashReceivedIdr": "200000"
}
```

Kasir **tidak mengirim `grandTotalIdr` sebagai sumber kebenaran**. Backend:

1. Validasi role staff dan input + idempotency key. Jika payment dengan **key yang sama** sudah tercatat dan payload semantik cocok, kembalikan hasil lama (`200 replay`).
2. Mulai transaksi PostgreSQL di **satu connection**. Ambil `store_settings` dengan shared lock, lalu lock baris `dining_tables` dan `table_sessions` (`FOR UPDATE`) menggunakan urutan konsisten. Ini mencegah admin billing toggle atau additional order memotong perhitungan saat commit.
3. Pastikan sesi aktif, meja Occupied, ada minimal satu item non-void, seluruh order dengan item valid sudah Served, tidak ada payment sebelumnya.
4. Bandingkan `(bill_revision, settings.version)` dengan pasangan `expected...`. Bila berbeda: **rollback 409 `BILL_CHANGED`**, UI refetch quote dan kasir mengonfirmasi ulang, **tanpa** auto-pay.
5. Hitung ulang subtotal, diskon, pajak, total. Jika cash kurang: `422 CASH_INSUFFICIENT`.
6. Insert **satu** row `payments` dengan `receipt_snapshot`, nominal, cash, kembalian, versi; tutup sesi `closure_reason=PAID`; set meja `AVAILABLE`; `cycle_number += 1`; tulis audit; **commit atomik**.
7. Jika timeout sesudah commit, retry dengan key sama mengembalikan receipt lama. Key berbeda saat sesi sudah Paid → `409 PAYMENT_ALREADY_RECORDED`.

**201**:

```json
{
  "data": {
    "paymentId": "197224a6-ea9a-4697-9e35-8728d08037ec",
    "sessionId": "c61c1269-8a27-4c5f-8fb1-295cd5a7afe3",
    "paymentStatus": "PAID",
    "method": "CASH",
    "subtotalIdr": "150000",
    "discountIdr": "10000",
    "taxIdr": "15000",
    "grandTotalIdr": "155000",
    "cashReceivedIdr": "200000",
    "changeIdr": "45000",
    "sessionClosed": true,
    "tableStatus": "AVAILABLE",
    "receiptUrl": "/pos/transactions/197224a6-ea9a-4697-9e35-8728d08037ec",
    "paidAt": "2026-10-10T06:45:00Z"
  }
}
```

> **Catatan transaksi konkurensi:** query billing harus memakai semua item dari sesi di bawah lock yang relevan; **semua** operasi yang menambah/mengubah order harus mengikuti lock meja→sesi sama. Settings update mengunci row settings. Audit dan efek penutupan masuk transaksi yang sama. Jangan mengandalkan tombol disabled sebagai satu-satunya guard.

### 6.3 `POST /api/staff/table-sessions/{sessionId}/close-all-void`

Body `{ "expectedSessionRevision": "11", "reason": "Seluruh item dibatalkan" }`. Lock meja/sesi, cek **pernah ada minimal satu item pesanan dan sekarang tidak ada satu pun item non-void**, payment tidak ada, session aktif. Sesi reservasi yang belum mempunyai pesanan bukan kasus ALL_VOID; penutupan sesi kosong (misalnya tamu pergi sebelum memesan) memerlukan aturan terpisah. Tutup `closure_reason=ALL_VOID`, reset status meja, tambah cycle, catat audit, **tanpa** insert payment dan **tanpa** revenue. **200**:

```json
{
  "data": {
    "sessionId": "c61c1269-8a27-4c5f-8fb1-295cd5a7afe3",
    "closureReason": "ALL_VOID",
    "tableStatus": "AVAILABLE",
    "paymentCreated": false
  }
}
```

`409 SESSION_HAS_ACTIVE_ITEMS` jika item valid masih ada; `409 BILL_CHANGED` jika revision berbeda.

### 6.4 `GET /api/staff/payments` dan `GET /api/staff/payments/{id}/receipt`

Filter payments `?from=2026-10-01&to=2026-10-10&page=1&pageSize=20`; riwayat **hanya** Paid. Detail receipt menggunakan **snapshot permanen** yang disimpan saat pay, bukan query harga/menu/tax sekarang. Contoh detail:

```json
{
  "data": {
    "paymentId": "197224a6-ea9a-4697-9e35-8728d08037ec",
    "storeName": "Restaurant POS Demo",
    "tableNumber": "05",
    "orders": [
      {
        "customerName": "Aulia",
        "items": [{ "menuName": "Nasi Goreng", "quantity": 2, "unitPriceIdr": "25000", "lineTotalIdr": "50000" }]
      }
    ],
    "subtotalIdr": "150000",
    "discountIdr": "10000",
    "tax": { "rateBps": 1000, "amountIdr": "15000" },
    "grandTotalIdr": "155000",
    "cashReceivedIdr": "200000",
    "changeIdr": "45000",
    "paidAt": "2026-10-10T06:45:00Z"
  }
}
```

Tanpa `print`, `download PDF`, atau integrasi printer sebagai persyaratan MVP. Tampilan preview disusun frontend.

---

## 7. Reservasi manual — kontrak P1

**Status reservasi** `RESERVED|CHECKED_IN|CANCELLED` hanya untuk record `reservations`; **status meja tetap** `AVAILABLE|OCCUPIED|RESERVED`.

- `GET /api/staff/reservations?status=RESERVED&page=1&pageSize=20`: daftar nama, nomor kontak (**hanya staff**), jumlah tamu, tanggal waktu, nomor meja.
- `POST /api/staff/reservations` Body:

```json
{
  "tableId": "1e0a1d6d-830f-4ffd-bbab-7a8cfb5c94ad",
  "customerName": "Nabila",
  "customerContact": "08xxxxxxxxxx",
  "guestCount": 4,
  "reservedFor": "2026-10-11T12:00:00+07:00",
  "notes": "Hubungi lewat telepon"
}
```

  Server hanya menerima meja `AVAILABLE`, lock baris meja, insert reservasi `RESERVED`, ubah status meja `RESERVED` atomik. `201` mengembalikan reservation id, status dan metadata.
- `POST /api/staff/reservations/{id}/check-in` Body `{}`: reservasi harus `RESERVED`, lock meja, buat sesi aktif, ubah reservation `CHECKED_IN`, meja `OCCUPIED`; `200` data `{reservationId, status:"CHECKED_IN", sessionId, tableStatus:"OCCUPIED"}`.
- `POST /api/staff/reservations/{id}/cancel` Body `{"reason":"Pelanggan membatalkan"}`: hanya jika `RESERVED`; ubah status `CANCELLED`, meja `AVAILABLE`, audit. Tidak ada reservasi mandiri, auto-expiry atau blokir berdasarkan kalender; tanggal/jam adalah catatan kasir. **Usulan detail**: status Reserved mengunci meja seketika saat diinput.

---

## 8. Admin — menu, meja, staff, setting, laporan

### 8.1 Menu dan kategori

**Kategori**:

- `GET /api/admin/categories`: list kategori aktif/nonaktif, urutan, jumlah menu.
- `POST /api/admin/categories` `{ "name":"Minuman", "sortOrder":2, "isActive":true }` → `201`.
- `PATCH /api/admin/categories/{id}` hanya field boleh diubah (`name`, `sortOrder`, `isActive`); `200`.
- `DELETE /api/admin/categories/{id}` → `409 CATEGORY_IN_USE` bila ada menu, termasuk terarsip; usulan MVP: prefer `PATCH isActive=false`, bukan hard-delete.

**Menu**:

- `GET /api/admin/menus?q=nasi&categoryId={uuid}&available=false&page=1&pageSize=20`; mengembalikan menu termasuk unavailable; item archived hanya jika `includeArchived=true`.
- `POST /api/admin/menus` Body:

```json
{
  "categoryId": "e3542d20-3a9b-4cd0-869e-e2dd208673ba",
  "name": "Nasi Goreng",
  "description": "Nasi goreng spesial",
  "priceIdr": "25000",
  "imageUrl": "https://example.test/images/nasi.jpg",
  "isAvailable": true
}
```

  Server memvalidasi kategori ada, harga integer IDR ≥ 0, URL gambar aman/diizinkan, ukuran teks; `201` menu baru. **Tidak menerima `stockQuantity`, bahan, atau resep.**
- `GET /api/admin/menus/{id}` → `200` detail.
- `PATCH /api/admin/menus/{id}` → `200`; partial body dari field yang sama; mengubah harga hanya berdampak ke checkout selanjutnya, **tidak** mengubah item yang telah dipesan.
- `PATCH /api/admin/menus/{id}/availability` Body `{"isAvailable":false}` → `200`; berpengaruh seketika ke checkout baru, tidak menghapus item historis.
- `DELETE /api/admin/menus/{id}` → `200` dengan `{archivedAt}`; **soft archive**, bukan `DELETE` SQL fisik.
- `POST /api/admin/media/menu-images` (P2) multipart, validasi MIME dan ukuran, upload server-side/preset aman; bukan menyimpan foto ke Neon. Sebelum P2, Admin dapat mengisi URL gambar dari penyedia tepercaya.

### 8.2 Meja dan QR

- `GET /api/admin/tables`: semua meja aktif/nonaktif, nomor, status, QR URL; tidak perlu menampilkan raw secret lain.
- `POST /api/admin/tables` `{ "tableNumber":"05" }` → `201 {id,tableNumber,status:"AVAILABLE",orderUrl}`; server membuat `qr_token` acak tidak mudah ditebak.
- `PATCH /api/admin/tables/{id}` `{ "tableNumber":"06", "isActive":true }` → `200`. Hanya ubah/nonaktifkan ketika **tidak** Occupied/Reserved dan tidak punya sesi aktif; menolak duplikasi nomor.
- `GET /api/admin/tables/{id}/qr?format=svg` → `image/svg+xml` (bukan JSON) atau gunakan metadata `orderUrl` untuk generate QR client secara lokal. **Bukan QRIS**. Tidak menyediakan endpoint manual bebas untuk mengubah status meja tanpa menjalankan transaksi sesi/reservasi.

### 8.3 Manajemen akun staff

- `GET /api/admin/staff?page=1&pageSize=20`: `{userId,displayName,role,isActive,createdAt}`; jangan tampilkan password/token/hash.
- `POST /api/admin/staff` Body `{"email":"cashier@example.test","displayName":"Kasir 1","role":"CASHIER"}`; buat identitas **melalui operasi Admin Neon Managed Auth** dan profil staff. Tidak ada signup publik atau password di API admin aplikasi. **201** mengembalikan profil tanpa kredensial. Alur pengiriman undangan/reset dan kompensasi bila profil gagal dibuat sesudah user Auth tercipta wajib diverifikasi pada BE-03 sebelum endpoint dirilis.
- `PATCH /api/admin/staff/{userId}` Body subset `{"displayName":"Kasir Sore","isActive":false}`; nonaktifkan akses saat cek RBAC berikutnya. Perubahan role sensitif perlu audit, dan cegah menonaktifkan satu-satunya admin aktif. Tidak ada endpoint kasir membuat akun.

### 8.4 Setting diskon dan pajak live

`GET /api/admin/settings/billing` →

```json
{
  "data": {
    "discountEnabled": false,
    "discountAmountIdr": "10000",
    "taxEnabled": true,
    "taxRateBps": 1000,
    "version": "4",
    "updatedAt": "2026-10-10T06:10:00Z"
  }
}
```

`PUT /api/admin/settings/billing` Body **semua field + expectedVersion**:

```json
{
  "expectedVersion": "4",
  "discountEnabled": true,
  "discountAmountIdr": "10000",
  "taxEnabled": true,
  "taxRateBps": 1000
}
```

`200` mengembalikan data terbaru termasuk `version="5"`. Validasi diskon ≥ 0, tarif 0–10000 bps sesuai check DB (pajak restoran sesungguhnya mengikuti aturan yang berlaku). Update settings dalam transaksi, `version = version + 1` termasuk ketika toggle dipadamkan; jika version usang → `409 SETTINGS_CHANGED`. **Seluruh quote Unpaid membaca versi terbaru** pada refetch/polling; Paid receipt tak pernah berubah. Tidak ada sinkronisasi instan push di MVP; “live” berarti data perhitungan langsung memakai konfigurasi terbaru saat diambil ulang, bukan harus sub-detik.

### 8.5 Laporan untuk custom chart

`GET /api/admin/reports/revenue?from=2026-10-01&to=2026-10-10&groupBy=day` →

```json
{
  "data": {
    "currency": "IDR",
    "timezone": "Asia/Jakarta",
    "summary": { "revenueIdr": "2750000", "paidTransactionCount": 28 },
    "points": [
      { "date": "2026-10-09", "revenueIdr": "350000", "transactionCount": 4 },
      { "date": "2026-10-10", "revenueIdr": "420000", "transactionCount": 5 }
    ]
  }
}
```

`GET /api/admin/reports/top-menus?from=2026-10-01&to=2026-10-10&limit=10` → list `{menuName, quantitySold, grossSalesIdr}` dari item non-void sesi **yang dibayar**, bukan Pending/All Void. Report tidak menggunakan library chart server; frontend menggambar React/SVG custom. Batasi rentang waktu dan jumlah data demi free tier.

---

## 9. Error code registry (stabil untuk frontend)

| Code | HTTP | Kondisi / reaksi UI |
|---|---:|---|
| `VALIDATION_ERROR` | 422 | Tampilkan field errors |
| `UNAUTHENTICATED` | 401 | Arahkan staff ke login / guest ulangi nama |
| `FORBIDDEN` | 403 | Jangan tampilkan aksi yang tidak diizinkan |
| `INVALID_TABLE_TOKEN` | 404 | QR tidak dikenali |
| `TABLE_CYCLE_CHANGED` | 409 | Tab QR lama; minta scan/refresh dan input nama lagi |
| `TABLE_RESERVED` | 409 | Kasir harus check-in reservasi |
| `TABLE_NOT_OPEN` | 409 | Jika keputusan manual-open dipilih, minta kasir membuka sesi |
| `TABLE_NOT_AVAILABLE` | 409 | Meja tidak memenuhi operasi reservasi/manajemen |
| `MENU_UNAVAILABLE` | 409 | Refresh cart/menu; item tak bisa dibeli |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Key sama untuk isi request berbeda |
| `INVALID_ORDER_TRANSITION` | 409 | Refresh status order |
| `ITEM_ALREADY_SERVED` | 409 | Void customer request dilarang setelah Served |
| `ITEM_ALREADY_VOIDED` | 409 | Item sudah dibatalkan |
| `NOT_ALL_ITEMS_SERVED` | 409 | Checklist seluruh pesanan aktif dahulu |
| `BILL_CHANGED` | 409 | Refetch quote; kasir periksa ulang total |
| `SETTINGS_CHANGED` | 409 | Admin refetch dan ulangi update setting |
| `CASH_INSUFFICIENT` | 422 | Nominal uang diterima lebih kecil dari total |
| `SESSION_NOT_ACTIVE` | 409 | Sesi sudah ditutup/tidak ada |
| `SESSION_HAS_ACTIVE_ITEMS` | 409 | Penutupan ALL_VOID tidak diperbolehkan |
| `PAYMENT_ALREADY_RECORDED` | 409 | Cek riwayat pembayaran, jangan pay lagi |
| `CATEGORY_IN_USE` | 409 | Nonaktifkan kategori, jangan hapus fisik |
| `RATE_LIMITED` | 429 | Tampilkan retry yang wajar |
| `INTERNAL_ERROR` | 500 | Feedback aman tanpa rincian infrastruktur |

**Optional conflict response**, misalnya `BILL_CHANGED`:

```json
{
  "error": {
    "code": "BILL_CHANGED",
    "message": "Nominal tagihan telah berubah.",
    "details": { "latestQuoteAvailable": true }
  }
}
```

Hindari mengirim quote finansial sensitif pada error publik. Pada staff, UI **memanggil ulang** `GET .../bill` dan meminta tindakan konfirmasi baru.

---

## 10. Validasi Zod — kontrak TypeScript acuan

Implementasi awal berada di [`src/lib/contracts.ts`](../src/lib/contracts.ts); file tersebut menjadi sumber schema Zod untuk checkout, payment, billing settings, dan void. Schema memakai strict object, string desimal IDR (maksimum 9.000.000.000.000.000), string versi positif yang muat `BIGINT`, qty integer 1–99, maksimum 30 baris, dan menolak item menu duplikat. Tidak ada coercion untuk angka ambigu (`"1.2"`, `"-10"`, `NaN`, integer tidak aman). Contoh bentuk kontrak:

```ts
import {
  checkoutSchema,
  paymentSchema,
  billingSettingsSchema,
  voidSchema,
} from "@/lib/contracts";
```

Catatan: saat membuat response `priceIdr`, `billRevision`, atau `settingsVersion`, ubah nilai `bigint` menjadi string. Saat parse uang, gunakan `BigInt` pada server lalu pastikan nilai berada dalam batas PostgreSQL `BIGINT`, dan batasi nominal operasional lebih rendah bila perlu.

---

## 11. Sequence dan aturan concurrency

### 11.1 QR ke Preparing lalu Served

```mermaid
sequenceDiagram
  participant U as Customer
  participant API as Next.js API
  participant DB as Neon Postgres
  participant K as Cashier
  U->>API: GET /public/tables/{token}
  API-->>U: Meja + cycle
  U->>API: POST /guests (nama)
  API-->>U: guestToken
  U->>API: GET /menu (guestToken)
  API-->>U: Katalog aktif
  U->>API: POST /orders (idempotency key)
  API->>DB: BEGIN; lock table; create/join session; insert order; COMMIT
  API-->>U: 201 Pending + orderViewToken
  K->>API: GET /staff/orders?status=PENDING
  API-->>K: Order baru
  K->>API: POST /orders/{id}/confirm
  API->>DB: Lock & update Preparing
  K->>API: PATCH /order-items/{id}/served
  API->>DB: Lock; servedAt; derive order Served
  U->>API: GET /public/orders/{id}
  API-->>U: Preparing atau Served + progress
```

### 11.2 Pembayaran vs additional order / perubahan setting

```mermaid
sequenceDiagram
  participant A as Admin
  participant U as Customer
  participant K as Cashier
  participant API as API/Services
  participant DB as Neon
  K->>API: GET quote (revision=8, settings=4)
  A->>API: PUT billing settings
  API->>DB: UPDATE store_settings; version=5
  U->>API: POST additional order
  API->>DB: Lock meja+sesi; insert order; revision=9
  K->>API: POST cash pay (expected 8/4)
  API->>DB: BEGIN; shared-lock settings; lock meja+sesi
  API->>DB: Cek current revision=9, settings=5
  API-->>K: 409 BILL_CHANGED
  K->>API: GET quote terbaru
  API-->>K: Revision 9, settings 5, total terbaru
  Note over K,API: Kasir pastikan semua Served dan terima uang sesuai total baru
  K->>API: POST cash pay dengan versi terbaru
  API->>DB: Payment + receipt + close session + Available atomik
  API-->>K: 201 Paid + change
```

**Kebijakan lock** (rancangan implementasi service):

- Staff settings update: lock/update hanya `store_settings` dan audit; naikkan `version` selalu.
- Semua perubahan order/session (checkout, manual, confirm, served, void, close): lock `dining_tables` lalu active `table_sessions` secara konsisten.
- Pembayaran: shared lock `store_settings` → lock `dining_tables` → lock `table_sessions`; recheck active order + total di dalam transaksi; persist snapshot dan close. Penguncian settings menjaga toggle admin tidak berubah hingga pay commit.
- Bila operasi serialisasi/deadlock terdeteksi, rollback dan lakukan retry terkendali **dengan key idempotensi yang sama**; jangan mengulangi konfirmasi pembayaran secara diam-diam setelah perubahan nominal.
- Gunakan koneksi PostgreSQL/driver yang mendukung **interactive transaction** dan lock `SELECT ... FOR UPDATE`. Jangan menjalankan tiap SQL pada koneksi terpisah.

---

## 12. Perubahan kecil yang dibutuhkan pada schema v1.0

Dokumen API tidak boleh diam-diam mengklaim kolom yang belum ada di [`05-schema-reference.sql`](05-schema-reference.sql). Usulan penyesuaian sebelum membuat Drizzle migrations:

| Perubahan | Alasan | Status |
|---|---|---|
| `orders.request_fingerprint` (`TEXT NOT NULL`, SHA-256 hex lowercase) | Bedakan retry identik vs key sama dengan payload berbeda | **Selaras dengan SQL 05** |
| Kolom/tabel untuk revoked public token **tidak wajib** | Token signed + expiry + cycle check dapat dipakai tanpa tabel baru pada MVP | Desain API |
| `store_settings.version`, `table_sessions.bill_revision`, `dining_tables.cycle_number` | **Sudah tersedia** di schema 05 | Tidak perlu migrasi baru |
| `payments.idempotency_key` dan `receipt_snapshot` | **Sudah tersedia** di schema 05 | Tidak perlu migrasi baru |
| `orders.voided_at`, `order_items.void*`, `served_at` | **Sudah tersedia** di schema 05 | Tidak perlu migrasi baru |
| Auth tables di schema `neon_auth` | Dikelola Neon Managed Auth, terpisah dari migrasi Drizzle domain | `neon_auth.user.id` UUID telah diverifikasi pada BE-02; FK staff ada di migrasi |

**Fingerprint:** SHA-256 hex lowercase dari representasi kanonis `{source,tableId,cycleNumber,customerName,note,items}`. Gunakan nilai setelah validasi dan normalisasi: note opsional menjadi string kosong, item diurutkan stabil berdasarkan `menuItemId`, dan setiap item memuat `quantity` serta note ternormalisasi. Jangan hash token tamu mentah atau urutan key JSON asli. Key request yang sama + fingerprint sama → replay order lama; key sama + fingerprint berbeda → `409 IDEMPOTENCY_KEY_REUSED`. Implementasi hash dan race test berada di BE-06.

---

## 13. Polling, caching, dan performa

- Kasir: polling `GET /staff/orders?status=PENDING` dan `GET /staff/tables` setiap **3–5 detik** saat tab aktif; hentikan polling ketika tidak terlihat, refetch saat reconnect/focus. `Cache-Control: no-store`.
- Pelanggan: polling `GET /public/orders/{orderId}` setiap 5–10 detik saat menunggu, hentikan ketika order sudah Served atau selesai ditampilkan. Jika diperlukan, tampilkan manual refresh.
- Admin setting: UI dapat invalidate/refetch setelah PUT; perubahan bill di kasir terlihat pada polling/refetch berikutnya. Versi server adalah pengaman, bukan kecepatan polling.
- List: pagination server (`page`, `pageSize` default 20, maksimal 100), batas query/date ranges, indeks dari dokumen 05.
- Dashboard revenue: hanya membaca `payments` yang sukses, bukan `orders` belum dibayar. Perhitungan custom chart dikerjakan di frontend berdasarkan API agregat.
- Jika Neon terganggu: kembalikan error terkontrol; jangan mengklaim checkout/payment berhasil sebelum commit. Gunakan backoff untuk GET; POST retry harus idempotent.

---

## 14. Contract test dan acceptance test API

| ID | Skenario API | Ekspektasi |
|---|---|---|
| API-01 | Public akses katalog tanpa nama/guest token | `401` atau `403` |
| API-02 | Submit checkout untuk item Inactive | `409 MENU_UNAVAILABLE`, tanpa order |
| API-03 | Klik checkout dua kali, key sama, payload sama | 1 order; replay `200` atau respons identik |
| API-04 | Key checkout sama, payload berbeda | `409 IDEMPOTENCY_KEY_REUSED` |
| API-05 | Dua checkout bersamaan ke meja Available | Hanya 1 table session aktif, 2 order |
| API-06 | Order QR pending; kasir confirm | `PENDING → PREPARING` |
| API-07 | Serve satu dari dua item | Order tetap `PREPARING` |
| API-08 | Serve baris terakhir yang valid | Order menjadi `SERVED` |
| API-09 | Void biasa pada Served | `409 ITEM_ALREADY_SERVED` |
| API-10 | Void karena kesalahan pegawai pada Served (Unpaid) | Berhasil + alasan/audit |
| API-11 | Pembayaran ketika satu order belum Served | `409 NOT_ALL_ITEMS_SERVED` |
| API-12 | Admin hidupkan tax setelah quote diambil | Bayar quote lama `409 BILL_CHANGED` |
| API-13 | Additional order setelah quote diambil | Bayar quote lama `409 BILL_CHANGED` |
| API-14 | Cash kurang dari total | `422 CASH_INSUFFICIENT` |
| API-15 | Double-submit pembayaran | Hanya satu payment; retry key sama replay |
| API-16 | Pembayaran berhasil | Payment tersimpan, sesi closed, meja Available, cycle naik |
| API-17 | Semua item di-void, close all-void | Tidak ada payment/revenue, meja Available |
| API-18 | Harga menu diubah setelah order | Snapshot order dan receipt tetap konsisten |
| API-19 | Bill berubah setelah Paid | Receipt lama **tidak berubah** |
| API-20 | Kasir panggil endpoint admin | `403 FORBIDDEN` |
| API-21 | Token order A digunakan membuka order B | `403`/`404`, tidak bocorkan data |
| API-22 | Tab customer cycle lama submit order setelah sesi selesai | `409 TABLE_CYCLE_CHANGED` |
| API-23 | Reservasi meja Occupied | `409 TABLE_NOT_AVAILABLE` |
| API-24 | Dua staff reservasi meja yang sama bersamaan | Tepat satu reservasi aktif |
| API-25 | Timeout jaringan setelah commit payment | Retry key sama mengembalikan payment yang telah ada |
| API-26 | Admin mematikan diskon pada unpaid | Quote berubah sesuai versi baru, Paid lama tetap |

Gunakan Vitest (unit calculation/status), PostgreSQL lokal dengan data fiktif (integration + concurrency), Playwright (E2E QR sampai Paid). Gunakan fixtures, bukan layanan pembayaran sungguhan.

---

## 15. Definition of Done untuk API layer

- [ ] Semua endpoint P0 ada dan sesuai format success/error.
- [ ] Semua endpoint staff/admin memeriksa auth + role + is_active pada server.
- [ ] Semua mutasi Zod-validated; uang bukan JS float dan harga tidak dipercaya dari klien.
- [ ] Public guest scope/order-view tidak membocorkan order pelanggan lain.
- [ ] Checkout & payment idempotent; race tests lolos.
- [ ] Payment atomic: session Paid/Closed dan meja Available bersama snapshot receipt.
- [ ] Live billing mengikuti setting terbaru sampai Paid; `BILL_CHANGED` tervalidasi.
- [ ] Item Served per baris & void memiliki validasi dan audit.
- [ ] Riwayat Paid tidak dihitung ulang; tidak ada endpoint printing.
- [ ] Route handler mengeksekusi service modul domain (tidak berisi SQL panjang langsung).
- [ ] Dokumentasi contoh payload dan error sinkron dengan test integrasi.

---

## 16. Open decisions — tidak boleh diputuskan diam-diam

| ID | Pertanyaan | Baseline desain untuk melanjutkan API | Dampak |
|---|---|---|---|
| **OD-01** | Checkout pertama membuka sesi otomatis atau kasir membuka dulu? | **Usulan auto-open** untuk meja Available; QR Reserved harus check-in | Paling berpengaruh ke checkout/session |
| **OD-02** | Saat kasir salah centang Served, boleh menghapus centang? | MVP hanya `served=true`; koreksi staff dengan audit bisa dirancang terpisah | UI checklist, servis, audit |
| **OD-03** | Alur aktivasi kredensial staff baru | G-03 memilih Managed Auth tanpa public signup; verifikasi operasi Admin dan pengiriman setup/reset di BE-03 | Auth ops; tidak memengaruhi order DB |
| **OD-04** | Preview total tagihan bagi pelanggan menampilkan agregat satu meja? | `bill-summary` P1 hanya angka agregat, tanpa item/nama orang lain | Privasi QR statis |
| **OD-05** | Membatasi guest token saat meja telah menjadi Paid? | Cycle guard membatalkan token lama saat meja direset | Pengalaman refresh/order lama |
| **OD-06** | Bagaimana menutup sesi hasil check-in reservasi jika tamu tidak jadi memesan? | Belum ada endpoint close-empty; **jangan** gunakan close-all-void tanpa histori void | Penutupan sesi kosong di luar alur normal |

**Prioritas review:** putuskan **OD-01** sebelum coding checkout. Sisanya dapat diselesaikan saat modul terkait dimulai. Ini tidak menghalangi pembuatan Drizzle schema awal.

---

## 17. Referensi teknis resmi

- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers)
- [Next.js Authentication Guide](https://nextjs.org/docs/app/guides/authentication)
- [Better Auth Next.js Integration](https://www.better-auth.com/docs/integrations/next)
- [Drizzle Transactions](https://orm.drizzle.team/docs/transactions)
- [Drizzle Select / Query APIs](https://orm.drizzle.team/docs/select)

> **Perhatian:** endpoint dan aturan domain pada dokumen ini adalah desain proyek; link resmi hanya mendukung cara integrasi framework/library, bukan spesifikasi bisnis restoran ini.
