# Product Requirements Document (PRD)

## Restaurant POS & QR-Based Self-Ordering System

| Metadata | Detail |
|---|---|
| Versi | 1.2 — Draft untuk review |
| Tanggal | 10 Oktober 2026 |
| Tipe produk | Aplikasi web POS restoran/kafe dengan pemesanan berbasis QR meja |
| Target implementasi | Satu outlet, satu sistem terintegrasi (modular monolith) |
| Dokumen berikutnya | Business Rules & User Flows, ERD, Technical Specification |

> **Status keputusan:** Kebutuhan bisnis yang telah disepakati diberi label **Tetap**. Pilihan detail yang belum dikonfirmasi diberi label **Usulan** dan dapat direvisi sebelum implementasi.

---

## 1. Ringkasan Produk

Restaurant POS & QR-Based Self-Ordering System adalah aplikasi web yang menggabungkan sistem kasir dengan pemesanan mandiri melalui QR Code unik pada setiap meja. Pelanggan dapat membuka daftar menu, menyusun keranjang, dan mengonfirmasi pesanan tanpa akun. Pesanan masuk ke dashboard kasir untuk dikonfirmasi dan dilayani.

Kasir dapat menangani pesanan tambahan, memasukkan pesanan secara manual, melakukan reservasi meja manual, serta menerima **satu pembayaran tunai penuh di akhir sesi meja**. Admin mengelola menu, meja/QR, akses akun kasir, konfigurasi diskon dan pajak, serta memantau laporan penjualan.

**Batas produk:** QR Code dipakai sebagai tautan pemesanan, **bukan QRIS pembayaran**. Proyek ini ditujukan sebagai portofolio full-stack dan demo operasional, bukan layanan SaaS komersial pada MVP.

## 2. Latar Belakang dan Masalah

Proses pemesanan konvensional sering membutuhkan staf untuk mencatat pesanan, memeriksa meja, dan menjumlahkan pesanan tambahan secara manual. Ini berpotensi menimbulkan kesalahan nomor meja, item terlewat, serta inkonsistensi tagihan. Sistem yang diusulkan menyediakan satu sumber data untuk status pesanan, sesi meja, pembayaran, dan laporan kasir/admin.

### 2.1 Tujuan Produk

1. Memungkinkan pelanggan memesan mandiri dari meja melalui QR Code tanpa registrasi.
2. Mengirim setiap pesanan yang dikonfirmasi pelanggan ke dashboard kasir.
3. Menggabungkan pesanan awal dan tambahan dalam satu sesi/tagihan meja.
4. Memastikan pembayaran penuh dicatat dan diverifikasi kasir sebelum meja tersedia kembali.
5. Memberikan kontrol menu, staf, diskon/pajak, meja, dan metrik penjualan kepada admin.
6. Mendemonstrasikan implementasi full-stack yang aman, konsisten, dan teruji sebagai portofolio.

### 2.2 Di Luar Cakupan MVP

Split bill; pembayaran QRIS/gateway/kartu; refund otomatis; delivery/takeaway; akun pelanggan; pelanggan membatalkan pesanan sendiri; pemesanan reservasi mandiri secara online; pengelolaan stok/inventaris; bahan baku/resep; kitchen display system; multi-outlet/multi-tenant; pengelolaan shift kasir; loyalty program; notifikasi WhatsApp otomatis; dan integrasi perangkat kasir khusus.

## 3. Pengguna dan Hak Akses

| Peran | Akses utama |
|---|---|
| **Pelanggan (publik, tanpa login)** | Scan QR meja, **mengisi nama pemesan sebelum melihat menu**, mencari/memilih menu aktif, mengirim pesanan, melihat statusnya dan tagihan relevan. Tidak memakai PIN/login dan tidak dapat membatalkan pesanan dari website. |
| **Kasir (login)** | Melihat pesanan/meja, menerima pesanan, mengubah Preparing → Served, membuat pesanan manual, memproses pembatalan, mencatat reservasi, menerima pembayaran penuh, melihat preview struk digital, menutup sesi. |
| **Admin (login)** | Semua kewenangan operasional yang diperlukan; kelola menu, meja & QR, akun kasir, konfigurasi diskon/pajak, dan melihat revenue/laporan. |

Autorisasi wajib divalidasi di server, bukan hanya dengan menyembunyikan tombol pada UI.

## 4. Ruang Lingkup MVP dan Prioritas

| Prioritas | Modul | Cakupan |
|---|---|---|
| P0 — Wajib | Auth & RBAC | Login admin/kasir, pembatasan akses berbasis role |
| P0 — Wajib | Menu | CRUD, kategori, foto, harga, deskripsi, toggle Active/Inactive, pencarian |
| P0 — Wajib | Meja & QR | CRUD meja, token QR unik, label nomor meja, tiga status meja |
| P0 — Wajib | QR Ordering | Input nama wajib setelah scan QR, website pelanggan, cart, konfirmasi order, status pesanan |
| P0 — Wajib | Order Kasir | Order berdasarkan meja, konfirmasi, checklist Served per item, additional order, input manual |
| P0 — Wajib | Sesi & Billing | Sesi meja aktif, satu tagihan gabungan; diskon/pajak live sampai pelunasan |
| P0 — Wajib | Pembayaran & Struk digital | Cash penuh, nominal diterima & kembalian, preview struk (tanpa cetak), tutup sesi/reset meja |
| P1 — Penting | Reservasi manual | Dibuat/dibatalkan kasir, tandai meja Reserved, check-in manual |
| P1 — Penting | Dashboard & laporan | Revenue dari transaksi lunas, ringkasan penjualan, custom charts |
| P1 — Penting | Staff & audit | Tambah/nonaktifkan akses kasir, jejak pembatalan dan pembayaran |
| P2 — Lanjutan | Peningkatan operasional | Ekspor laporan, advanced analytics, penjadwalan reservasi, KDS, dll. |

**Definisi MVP operasional:** pelanggan mengisi nama setelah scan QR lalu mengirim pesanan, kasir mengonfirmasi dan mencentang item yang telah Served, pesanan tambahan digabungkan, pelanggan membayar lunas secara cash, preview struk digital tersedia, dan meja kembali Available. Modul P1 melengkapi cakupan produk v1.0.

## 5. Alur Pengguna Utama

### 5.1 Pelanggan — Pemesanan dari QR

1. Pelanggan memindai QR yang berisi URL dengan token meja unik.
2. Sistem memvalidasi token dan menampilkan nomor meja, kemudian **meminta nama pemesan wajib diisi** sebelum membuka katalog. Tidak ada PIN atau login pelanggan.
3. Setelah nama valid, pelanggan melihat menu Active, mencari/memilih item, mengatur kuantitas, dan membuat cart.
4. Sistem menampilkan subtotal, diskon rupiah dan pajak atas **subtotal awal** bila aktif, serta perkiraan total; pelanggan mengonfirmasi.
5. Backend memverifikasi meja, nama pemesan, menu, harga, dan idempotency request lalu menyimpan pesanan `Pending` dengan identitas pemesan pada order tersebut.
6. Dashboard kasir menampilkan pesanan berdasarkan meja.
7. Setelah kasir mengonfirmasi, pesanan berubah ke `Preparing`. Kasir mencentang setiap baris item yang sudah disajikan; order otomatis menjadi `Served` ketika **semua baris item non-void** tersaji.
8. Pelanggan dapat memesan kembali di meja yang sama selama sesi masih aktif; setiap additional order memiliki status sendiri.

**Usulan implementasi:** checkout pertama di meja `Available` membuka sesi aktif dan mengubah meja menjadi `Occupied` secara atomik. Jika meja `Reserved`, kasir harus check-in lebih dulu sebelum pemesanan. Alternatif pembukaan sesi secara manual dapat diputuskan pada dokumen Business Rules.

### 5.2 Kasir — Pemrosesan Pesanan

1. Kasir login dan melihat daftar meja, pesanan baru, serta detail pesanan per meja.
2. Pesanan pelanggan masuk sebagai `Pending`.
3. Kasir mengonfirmasi sehingga status menjadi `Preparing`.
4. Kasir mencentang baris item yang sudah disajikan; bila semua baris non-void pada order dicentang, status order otomatis menjadi `Served`. Checkbox per baris menandakan seluruh kuantitas baris sudah diantar (MVP).
5. Pesanan yang dimasukkan kasir secara manual langsung masuk sebagai `Preparing` setelah disimpan, karena tindakan kasir sekaligus merupakan konfirmasi (**Usulan**).
6. Untuk pembatalan biasa, pelanggan harus menghubungi kasir **sebelum pesanan Served**. Setelah Served, void hanya diperbolehkan untuk **kesalahan pegawai** yang diverifikasi kasir, dengan alasan dan audit; seluruh void harus sebelum Paid.

### 5.3 Kasir — Pembayaran dan Reset Meja

1. Kasir membuka detail meja `Occupied`, melihat seluruh order awal/tambahan, checklist penyajian, dan opsi pembayaran.
2. Tombol pembayaran **hanya dapat digunakan ketika seluruh order non-void pada sesi sudah `Served`**. Backend mengecek lagi syarat ini saat konfirmasi pembayaran.
3. Sistem menghitung **tagihan live** dari seluruh item non-void dan konfigurasi diskon/pajak admin **terbaru**, dengan diskon nominal sekali per sesi dan pajak dari subtotal sebelum diskon. Bila admin memperbarui setting saat sesi masih Unpaid, bill ikut berubah dan UI menampilkan perubahannya.
4. Kasir menginput nominal cash yang diterima dan meninjau ulang total. Jika versi tagihan berubah sejak halaman pembayaran dibuka (karena order, void, diskon, atau pajak), backend **menolak konfirmasi lama** dan meminta kasir melihat kembali nominal terbaru sebelum menerima uang/konfirmasi ulang.
5. Server memverifikasi cash diterima tidak kurang dari total dan menyimpan **tepat satu pembayaran penuh**, snapshot nominal + setting finansial yang dipakai, lalu menutup sesi dan mengubah meja menjadi `Available` **dalam satu transaksi atomik**.
6. Setelah `Paid`, snapshot transaksi tidak ikut berubah bila admin mengubah diskon/pajak/menu. Preview struk digital tetap bisa dibuka dari riwayat kasir, tanpa fitur print.
7. Jika seluruh item sesi di-void, kasir menutup sesi **tanpa mencatat pembayaran**, mengosongkan daftar pesanan aktif dan mengubah meja menjadi Available. Riwayat void/penutupan tetap tersimpan untuk audit; bukan hard-delete record historis.

**Aturan final:** *Live Before Payment, Frozen After Payment*. Pembayaran yang bersaing dengan additional order, perubahan setting, atau void harus diverifikasi ulang dari server. Seluruh penghitungan dan pengecekan dilakukan backend; tombol disabled di UI saja tidak cukup.

### 5.4 Kasir — Reservasi Manual

1. Pelanggan menghubungi nomor telepon/WhatsApp bisnis restoran di luar sistem.
2. Kasir membuat catatan reservasi: nama, kontak, tanggal/jam, jumlah tamu, meja, catatan opsional.
3. Kasir memilih meja yang tersedia dan mengubahnya menjadi `Reserved`, lalu memberi tanda fisik di restoran.
4. Saat pelanggan datang, kasir melakukan check-in, mengubah meja menjadi `Occupied`, dan memulai/memungkinkan sesi pemesanan.
5. Jika reservasi batal, kasir membatalkan catatan dan mengembalikan meja menjadi `Available` bila tidak sedang dipakai.

Tidak ada self-booking, notifikasi otomatis, penghitungan durasi, auto-expiry, atau penjadwalan ketersediaan meja secara otomatis pada MVP.

## 6. Aturan Bisnis (Business Rules)

| ID | Aturan | Status |
|---|---|---|
| BR-01 | Setiap meja mempunyai tepat satu identitas QR Code aktif; QR memuat token meja, bukan QRIS pembayaran. | Tetap |
| BR-02 | Satu meja maksimal memiliki satu `table_session` aktif pada suatu waktu. Riwayat sesi lama tetap tersimpan. | Tetap |
| BR-03 | Seluruh additional order pada meja yang sama sebelum sesi ditutup bergabung ke tagihan sesi aktif. | Tetap |
| BR-04 | Status order hanya `Pending` → `Preparing` → `Served`. Kasir mencentang `Served` per baris item (semua kuantitas baris sudah diantar); order otomatis `Served` jika semua item non-void dicentang. | Tetap |
| BR-05 | Hanya kasir dapat void item/order sebelum Paid; permintaan biasa harus sebelum Served. Setelah Served, void hanya untuk kesalahan pegawai dengan alasan spesifik dan audit. Void bukan status order keempat. | Tetap |
| BR-06 | Status meja hanya `Available`, `Occupied`, `Reserved`; tidak ada `Cleaning`. | Tetap |
| BR-07 | Pembayaran hanya tunai, satu pembayaran penuh per sesi meja di akhir; tidak ada split bill atau pembayaran sebagian. | Tetap |
| BR-08 | Status pembayaran (`Unpaid`/`Paid`) terpisah dari status order dan status meja. | Tetap |
| BR-09 | Admin mengendalikan ketersediaan menu dengan toggle `Active`/`Inactive`; tidak ada pencatatan stok atau resep. | Tetap |
| BR-10 | Menu Inactive tidak tampil untuk pemesanan baru dan tidak bisa di-checkout, termasuk jika masih tersimpan di cart. | Tetap |
| BR-11 | Admin mengatur nominal diskon rupiah dan persentase pajak serta toggle aktif/nonaktif secara terpisah. | Tetap |
| BR-12 | Saat aktif, diskon dan pajak otomatis dihitung di total tagihan **satu kali per sesi**, bukan berulang tiap additional order. | Tetap |
| BR-13 | Diskon nominal maksimum subtotal. **Pajak dihitung dari subtotal sebelum diskon**; rumus final dihitung di server dan dibulatkan ke Rupiah. | Tetap |
| BR-14 | Perubahan toggle/nilai diskon dan pajak admin berlaku live untuk **seluruh sesi Unpaid**, tetapi hanya sampai pembayaran; snapshot finansial dibekukan **saat Paid** dan tidak boleh berubah sesudahnya. | Tetap |
| BR-15 | Harga dan nama menu dipotret saat order dibuat agar transaksi historis tidak terpengaruh edit menu. | Tetap (integritas data) |
| BR-16 | Reset meja normal setelah full payment; bila semua item di-void, kasir menutup sesi tanpa payment lalu meja Available dan pesanan hilang dari tampilan aktif. Audit/riwayat void tetap tersimpan. | Tetap |
| BR-17 | Meja `Reserved` dibuka untuk order setelah check-in manual oleh kasir. | Usulan |
| BR-18 | Pendapatan dashboard bersumber dari transaksi yang sudah `Paid`, bukan pesanan belum lunas; uang kembalian bukan pendapatan. | Tetap (integritas data) |
| BR-19 | Operasi buat sesi, checkout, void, dan bayar harus mencegah duplikasi/race condition melalui constraint/transaction server. | Tetap (integritas data) |
| BR-20 | Sebelum katalog menu ditampilkan setelah scan QR, pelanggan wajib memasukkan nama; nama tersimpan per pesanan dan tidak berfungsi sebagai verifikasi identitas/lokasi. Tidak ada PIN pelanggan. | Tetap |
| BR-21 | Pembatalan item Served adalah **pengecualian khusus kesalahan pegawai**, bukan hak pembatalan biasa setelah dilayani, dan harus sebelum Paid. | Tetap |
| BR-22 | Struk hanya berupa preview digital dari snapshot transaksi yang telah dibayar, tersedia di detail/riwayat kasir; tidak ada cetak maupun reprint di MVP. | Tetap |
| BR-23 | Konfirmasi pembayaran hanya saat seluruh order non-void `Served`; guard di backend mencakup pesanan Pending/Preparing. | Tetap |
| BR-24 | Total bill yang belum lunas berubah mengikuti konfigurasi terbaru; pembayaran memerlukan versi bill terkini dan review ulang jika berubah. | Tetap |
| BR-25 | Snapshot diskon, tarif pajak, nilai pajak, total, uang diterima, dan kembalian disimpan pada payment sukses; tidak dihitung ulang dari pengaturan saat ini. | Tetap |
| BR-26 | Penutupan sesi all-void mengecualikan item batal dari tampilan aktif, menyimpan alasan/audit, dan tidak menghasilkan revenue/payment. | Tetap |

### 6.1 Formula Tagihan — Baseline MVP

- `subtotal = Σ (quantity × unit_price_snapshot)` untuk item yang tidak di-void pada semua order di sesi.
- `discount = is_discount_active ? min(configured_discount_amount, subtotal) : 0`.
- `taxable_base = subtotal` (**diputuskan untuk produk ini**; pajak dihitung sebelum diskon).
- `tax = is_tax_active ? round(subtotal × configured_tax_rate / 100) : 0`.
- `grand_total = subtotal - discount + tax`.
- `change = cash_received - grand_total`; wajib `cash_received >= grand_total`.

Tidak ada service charge pada MVP. Semua uang disimpan sebagai integer rupiah. Total di browser hanya preview; backend menghitung ulang dan menjadi sumber kebenaran.

## 7. Functional Requirements & Acceptance Criteria

### 7.1 Authentication dan Staff

**FR-AUTH-01 — Login staf (P0).** Admin dan kasir dapat login/logout; halaman privat dibatasi berdasarkan role. **Diterima jika:** pengguna anonim tidak bisa mengakses dashboard; kasir tidak dapat memanggil endpoint pengelolaan admin.

**FR-AUTH-02 — Akun kasir (P1).** Admin dapat membuat/memberikan akses serta menonaktifkan akun kasir. **Diterima jika:** akun nonaktif tidak lagi dapat menjalankan aksi privat dan kredensial tidak pernah disimpan plaintext.

### 7.2 Menu dan Kategori

**FR-MENU-01 — CRUD menu (P0).** Admin membuat, mengubah, dan mengarsipkan menu dengan nama, kategori, harga, deskripsi, gambar. **Diterima jika:** perubahan tampil di katalog; penghapusan tidak merusak order historis.

**FR-MENU-02 — Ketersediaan menu (P0).** Admin mengaktifkan/menonaktifkan menu. **Diterima jika:** menu Inactive tidak tersedia untuk checkout, termasuk cart lama; data pembelian lampau tidak berubah.

**FR-MENU-03 — Pencarian dan kategori (P0).** Pelanggan dapat mencari menu dan memfilter berdasarkan kategori. **Diterima jika:** hasil hanya berisi menu Active.

### 7.3 Meja dan QR

**FR-TABLE-01 — Manajemen meja (P0).** Admin mengelola nomor meja unik dan status meja. **Diterima jika:** duplikasi nomor meja ditolak dan status hanya tiga nilai yang diizinkan.

**FR-TABLE-02 — QR Code meja (P0).** Admin membuat/menampilkan QR dengan nomor meja dan URL unik yang dapat dicetak. **Diterima jika:** pemindaian mengarah ke meja yang tepat; token tidak mudah ditebak; token invalid ditolak.

**FR-TABLE-03 — Tampilan meja (P0).** Kasir melihat grid/daftar meja serta ringkasan sesi aktif. **Diterima jika:** status dan nominal tagihan disegarkan dari data server.

### 7.4 Pemesanan

**FR-ORD-01 — Nama pelanggan, keranjang, dan checkout publik (P0).** Pelanggan wajib memasukkan nama **setelah scan QR, sebelum memilih menu**, tanpa login/PIN; kemudian memilih menu aktif, kuantitas, catatan opsional, melihat ringkasan, dan mengonfirmasi. **Diterima jika:** katalog tidak terbuka sebelum nama valid dan request menyimpan `customer_name` pada masing-masing order `Pending` dengan identitas meja/sesi serta harga server yang benar. Nama tidak menjadi autentikasi.

**FR-ORD-02 — Status dan checklist Served (P0).** Kasir mengonfirmasi order `Pending` → `Preparing`, kemudian mencentang baris item satu per satu ketika semua kuantitas pada baris sudah diantar. Order otomatis menjadi `Served` jika semua baris non-void sudah dicentang. **Diterima jika:** tidak ada status order tambahan; guard server menolak perubahan ilegal dan pelanggan melihat status order yang benar.

**FR-ORD-03 — Additional order (P0).** Pelanggan dapat membuat order tambahan selama sesi aktif. **Diterima jika:** tercatat sebagai order baru dengan status sendiri, tetapi dijumlahkan pada satu tagihan meja.

**FR-ORD-04 — Order manual kasir (P0).** Kasir dapat memasukkan order atas nama meja. **Diterima jika:** item tercatat pada sesi meja yang benar, memakai harga resmi, dan masuk ke total sesi.

**FR-ORD-05 — Pembatalan melalui kasir (P0).** Kasir dapat void item/order sebelum pembayaran; pembatalan normal hanya ketika belum `Served`. Void item `Served` hanya boleh untuk **kesalahan pegawai** dengan alasan eksplisit. **Diterima jika:** server menolak alasan pembatalan biasa pada item Served, seluruh void diaudit, item void dikecualikan dari total, dan pelanggan tidak memiliki aksi cancel mandiri.

**FR-ORD-06 — Keamanan checkout (P0).** Backend memvalidasi token meja, daftar item, kuantitas, status menu, total server-side, serta idempotency. **Diterima jika:** pesanan duplikat, input invalid, atau manipulasi harga ditolak.

### 7.5 Billing, Pajak, Diskon, dan Pembayaran

**FR-BILL-01 — Tagihan gabungan live per sesi (P0).** Kasir dan pelanggan melihat bill estimasi dari seluruh item valid. **Diterima jika:** additional order tercakup, item void dikecualikan, diskon tidak berulang, perubahan setting admin memutakhirkan tagihan sesi Unpaid, dan rincian perubahan dapat terlihat setelah refresh/polling.

**FR-BILL-02 — Pengaturan diskon/pajak live (P0).** Admin mengisi nilai dan toggle masing-masing. **Diterima jika:** perubahan setting langsung berlaku untuk seluruh sesi Unpaid setelah refresh/polling; backend menghitung `total = subtotal − diskon + round(subtotal × tax_rate / 100)` untuk fitur yang aktif satu kali per sesi; sesi Paid tetap memakai snapshot pembayaran.

**FR-PAY-01 — Pelunasan cash (P0).** Pada detail meja, opsi pembayaran tersedia hanya setelah semua order aktif Served. Kasir mencatat cash diterima dan melihat kembalian. **Diterima jika:** backend menolak Pending/Preparing, cash kurang, split/partial, bill version lama; maksimal satu pembayaran sukses per sesi dan kasir diminta meninjau ulang total yang berubah.

**FR-PAY-02 — Penutupan sesi dan reset meja (P0).** Sesudah pembayaran sukses, sesi ditutup dan meja menjadi Available. **Diterima jika:** transaksi serta perubahan status terjadi atomik dan history tetap bisa diakses.

**FR-PAY-03 — Preview struk digital (P0).** Sistem menampilkan preview struk pada detail meja sesudah pembayaran atau detail riwayat transaksi kasir, berisi nomor transaksi, waktu, meja, nama pemesan pada setiap order, daftar item, subtotal, diskon, pajak, total, cash diterima, dan kembalian. **Diterima jika:** detail cocok dengan snapshot transaksi Paid; **tidak tersedia tombol cetak/print** pada MVP.

### 7.6 Reservasi, Dashboard, dan Audit

**FR-RES-01 — Reservasi kasir (P1).** Kasir mencatat reservasi hasil komunikasi lewat telepon/WhatsApp, memilih meja Available, memberi status Reserved, melakukan check-in atau pembatalan. **Diterima jika:** meja tidak bisa dipesan ganda dalam status Reserved dan pelanggan tidak membuat reservasi via website.

**FR-DASH-01 — Ringkasan usaha (P1).** Admin melihat pembayaran tunai terselesaikan, jumlah transaksi lunas, dan metrik menu terlaris dengan grafik custom. **Diterima jika:** agregasi didasarkan transaksi Paid, dengan periode tanggal jelas dan tidak menghitung kembalian.

**FR-AUD-01 — Audit trail (P1).** Sistem mencatat pelaku dan waktu untuk void, pembayaran, perubahan setting finansial, dan tindakan penting lain. **Diterima jika:** event dapat ditelusuri dan tidak dapat ditulis bebas oleh pelanggan.

## 8. Non-Functional Requirements

| ID | Persyaratan | Kriteria validasi |
|---|---|---|
| NFR-01 | Security | Server-side RBAC; secret tidak terekspos ke browser; sanitasi/validasi input; rate limit endpoint publik. |
| NFR-02 | Integritas transaksi | Unique active session per meja, unique pembayaran sukses per sesi, atomic checkout/payment, harga snapshot, idempotency key. |
| NFR-03 | Responsiveness | Customer mobile-first; kasir optimal tablet/desktop; admin desktop dan tetap usable di layar lebih kecil. |
| NFR-04 | Pembaruan data | **Usulan:** dashboard kasir polling tiap 3–5 detik dengan refresh saat tab aktif kembali, tanpa dependensi push realtime di MVP. |
| NFR-05 | Aksesibilitas dasar | Keyboard navigation, label form, feedback error, kontras wajar, tidak mengandalkan warna saja untuk status. |
| NFR-06 | Reliabilitas | Jika koneksi gagal, UI menampilkan status dan retry; transaksi tidak dianggap berhasil sebelum server mengonfirmasi. |
| NFR-07 | Data historis | Snapshot harga pada order dan snapshot diskon/pajak/total saat Paid membuat riwayat tetap konsisten saat admin mengubah pengaturan. |
| NFR-08 | Testing | Unit test untuk billing/status transitions; integration test transaksi; E2E untuk pemesanan hingga pelunasan. |
| NFR-09 | Observability | Error logging server, audit untuk aksi kritis, pesan kesalahan yang tidak membocorkan secret. |
| NFR-10 | Free-tier suitability | Menggunakan opsi gratis untuk demo; menghindari fitur berbiaya tetap dan mendokumentasikan batas paket yang dapat berubah. |

**Risiko QR publik:** token QR yang statis dapat difoto/dibagikan. QR bukan bukti bahwa pemesan berada di meja. Pengamanan MVP mengandalkan token acak, rate limit, validasi sesi, dan konfirmasi kasir sebelum pesanan diproses. MVP **tidak memakai PIN**; nama pemesan juga bukan bukti keberadaan. Risiko residual perlu didokumentasikan sambil memakai konfirmasi kasir, token acak, dan rate limiting.

## 9. Model Data Konseptual

Entitas inti: `users`, `dining_tables`, `table_sessions`, `categories`, `menu_items`, `orders`, `order_items`, `payments`, `store_settings`, `reservations`, `audit_logs`.

- `dining_tables (1) → (N) table_sessions`; satu saja boleh aktif.
- `table_sessions (1) → (N) orders`.
- `orders (1) → (N) order_items`.
- `order_items (N) → (1) menu_items` sebagai referensi, dengan snapshot nama dan harga.
- `table_sessions (1) → (0..1) payments` untuk pembayaran penuh final.
- `reservations` merujuk meja dan petugas kasir.
- `store_settings` menyimpan toggle/nilai pajak dan diskon serta `version`; semua sesi Unpaid membaca konfigurasi terbaru. **Payment Paid** menyimpan snapshot nilai diskon, tarif dan nominal pajak, total, serta versi bill saat pelunasan.
- `order_items` memuat informasi `served_at` / `served_by` per baris dan metadata `void` bila dibatalkan; `orders.status` dihitung/konsisten dengan penyajian seluruh baris non-void.

**Catatan:** Ini model konseptual PRD, bukan ERD final. Schema, index, constraint, dan normalisasi dirumuskan dalam `05-database-design.md`.

## 10. Arsitektur dan Batasan Teknologi

### 10.1 Keputusan Tetap

- **Arsitektur:** modular monolith (satu aplikasi/repository; modul bisnis terpisah secara internal).
- **Database:** NeonDB (PostgreSQL).
- **Dashboard charts:** komponen custom, tanpa Recharts.
- **Pembayaran:** tunai manual melalui kasir, tanpa integrasi payment gateway.
- **Inventory:** tanpa stok kuantitatif dan tanpa pengelolaan resep.
- **Budget:** layanan gratis untuk lingkungan portofolio/demo.

### 10.2 Usulan Implementasi yang Belum Mengikat

- Next.js App Router + TypeScript untuk frontend dan backend monolith.
- Drizzle ORM untuk schema/query PostgreSQL Neon.
- Better Auth untuk login staff dan session handling.
- Tailwind CSS + shadcn/ui untuk UI, React Hook Form + Zod untuk validasi.
- Custom React + SVG untuk grafik.
- Library QR Code untuk gambar/print QR.
- TanStack Query dengan polling untuk pembaruan pesanan kasir.
- Penyimpanan gambar gratis (misalnya Cloudinary) dan deployment nonkomersial gratis sesuai ketentuan provider.

## 11. Indikator Keberhasilan MVP

1. Seluruh demo journey berhasil: scan QR → **isi nama** → lihat menu → konfirmasi order → kasir Preparing → Served → additional order → bayar lunas → **preview struk digital** → meja Available.
2. Item pesanan yang dimatikan admin tidak bisa dipesan baru, tetapi histori aman.
3. Tagihan satu meja konsisten dengan seluruh order dan konfigurasi diskon/pajak terbaru sebelum Paid; snapshot setelah lunas tidak berubah.
4. Tidak muncul order/payment ganda ketika permintaan diulang atau dikirim bersamaan.
5. Kasir tidak bisa mengakses fungsi admin lewat UI maupun API.
6. Dashboard menunjukkan nilai pembayaran yang benar untuk transaksi lunas.
7. Skenario utama dan edge case memiliki test otomatis serta demo seed data.

## 12. Test Scenario Minimum

| Kasus | Hasil yang diharapkan |
|---|---|
| Dua browser memesan di meja sama | Dua order, satu sesi/tagihan aktif. |
| Checkout terkirim dua kali dengan idempotency key sama | Hanya satu order tersimpan. |
| Menu berubah menjadi Inactive setelah masuk cart | Checkout menu ditolak/diminta diperbarui. |
| Admin mengubah harga setelah order dibuat | Harga order historis tidak berubah. |
| Kasir void item sebelum Served dan belum Paid | Total berkurang dan alasan tercatat. |
| Kasir void item Served untuk permintaan biasa | Ditolak; setelah Served hanya pengecualian kesalahan pegawai sebelum Paid. |
| Kasir void item Served karena kesalahan pegawai sebelum Paid | Diterima dengan alasan dan audit; total diperbarui. |
| Scan QR tanpa mengisi nama | Katalog belum terbuka; validasi nama wajib. |
| Pelunasan berhasil | Preview struk tersedia pada detail/riwayat tanpa fitur print. |
| Checklist Served per item | Order `Preparing` tetap demikian sampai seluruh item non-void dicentang; baru menjadi `Served`. |
| Bayar ketika satu item belum Served | Tombol disabled dan API menolak pembayaran. |
| Admin menyalakan tax/diskon pada sesi Unpaid | Tagihan sesi berubah memakai konfigurasi terbaru dan tampilan kasir/pelanggan disegarkan. |
| Admin mengganti tax saat kasir mau membayar | Konfirmasi berbasis bill version lama ditolak, kasir melihat total baru sebelum mengonfirmasi. |
| Admin mengganti tax setelah Paid | Struk historis, pembayaran, dan revenue tidak berubah. |
| Semua item meja di-void | Sesi dapat ditutup tanpa pembayaran, meja Available, histori pembatalan tetap tersimpan. |
| Kasir mencoba bayar kurang dari total | Ditolak. |
| Dua kasir mencoba membayar sesi sama | Maksimal satu pembayaran sukses. |
| Pelanggan mencoba additional order saat sesi ditutup | Ditolak; tidak memodifikasi sesi lama. |
| Kasir mencoba reset meja dengan tagihan belum lunas | Ditolak kecuali prosedur penutupan tanpa transaksi untuk semua item void. |
| Admin mengubah setting diskon/pajak saat sesi berlangsung | Sesi Unpaid otomatis memakai setting terbaru pada pembacaan ulang; Paid tidak berubah. |
| Reservasi dibuat pada meja Reserved/Occupied | Ditolak atau kasir diminta memilih meja Available. |
| Cashier memanggil endpoint admin | Ditolak oleh server. |

## 13. Risiko, Asumsi, dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| QR statis dibagikan kepada orang di luar restoran | Token acak, rate limiting, pemantauan pesanan mencurigakan, konfirmasi kasir; **nama wajib bukan autentikasi** dan tidak ada PIN pada MVP. Risiko lokasi tidak terverifikasi tetap diterima untuk demo. |
| Double checkout atau pembayaran bersamaan | Idempotency key, unique constraint, transaction + locking. |
| Diskon/pajak berubah setelah pelanggan mulai memesan | Indikator total estimasi, refetch/polling versi setting, review ulang di layar pembayaran jika nominal berubah; payment snapshot sesudah Paid. |
| Data kasir tertinggal karena polling/koneksi | Refetch, indikator loading/offline, sumber kebenaran di database. |
| Free tier tidur/kuota habis | Seed data demo, pembatasan aset, dokumentasi deploy lokal; monitor kuota provider. |
| Foto menu dihapus/berubah | Simpan referensi media yang terkelola dan fallback image; order item menyimpan snapshot nama/harga. |

## 14. Roadmap Pengembangan

| Fase | Hasil akhir |
|---|---|
| 0 — Product & Design | PRD disetujui, business rules, user flows, ERD, API design, wireframe inti. |
| 1 — Foundation | Setup monolith, NeonDB, auth/roles, menu, meja, QR. |
| 2 — Ordering | Customer flow, cart, checkout, sesi meja, dashboard pesanan, status. |
| 3 — Transaction | Additional/manual order, void bersyarat, perhitungan bill, cash full payment, preview struk digital, reset. |
| 4 — Administration | Reservasi manual, diskon/pajak admin, staff management, dashboard custom charts, audit. |
| 5 — Portfolio Release | Testing, responsive & accessibility, seed data, deployment gratis, README, demo video. |

## 15. Keputusan Terbuka untuk Review Berikutnya

**Sudah diputuskan pada v1.2:** pembayaran penuh otomatis menutup sesi dan membuat meja Available; seluruh order non-void wajib Served sebelum pembayaran; kasir menandai Served melalui checklist per baris item; diskon/pajak **live pada sesi Unpaid** dan dibekukan pada `Paid`; sesi dengan semua item void dapat ditutup tanpa pembayaran dan disembunyikan dari daftar aktif (riwayat/audit tetap tersimpan).

**Keputusan terbuka yang benar-benar tersisa:**

1. **Pembukaan sesi pertama / risiko QR publik:** otomatis pada checkout pertama saat meja Available (baseline usulan), atau kasir harus membuka sesi dahulu? Tidak ada PIN dan pelanggan wajib mengisi nama, tetapi nama bukan bukti kehadiran. Kasir tetap memverifikasi order Pending.
2. **Void sebagian kuantitas satu baris:** untuk MVP, disarankan void satu baris penuh; untuk membatalkan sebagian, pisahkan baris item lebih dahulu.
3. **Kebijakan QR pada meja setelah pembayaran:** QR statis tetap dapat dibuka untuk pengunjung berikutnya; risiko pemesanan tidak sah perlu ditangani dengan konfirmasi kasir, token acak, rate limit, dan monitoring.

**Catatan implementasi:** penyimpanan histori void dan audit adalah rekomendasi integritas data untuk menghasilkan perilaku "hapus dari daftar aktif" tanpa hard-delete. Ini tidak menambah status order maupun status meja baru.

---

## 16. Definition of Done — Product Release

Versi portofolio dianggap siap ketika fitur P0 selesai, alur utama end-to-end dapat didemokan, aturan bisnis kritis diuji, modul P1 inti tersedia sesuai roadmap, UI bekerja di perangkat target, database historis konsisten, dan dokumentasi repo memuat instruksi setup, environment variables, seed data, arsitektur, screenshot, serta test run.

**Dokumen turunan berikutnya:** `02-business-rules.md` → `03-user-flows.md` → `04-system-architecture.md` → `05-database-design.md` → `06-api-specification.md` → `07-ui-ux-guidelines.md` → `08-development-roadmap.md`.
