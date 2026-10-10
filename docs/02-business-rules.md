# Business Rules — Restaurant POS & QR-Based Self-Ordering

| Metadata | Detail |
|---|---|
| Dokumen | `docs/02-business-rules.md` |
| Versi | 1.2 — Draft review |
| Tanggal | 10 Oktober 2026 |
| Sumber | `01-prd.md` v1.2 (10 Oktober 2026) |
| Cakupan | Satu outlet, dine-in, QR per meja, pembayaran tunai penuh |
| Dokumen terkait | `03-user-flows.md`; berikutnya `04-system-architecture.md` dan `05-database-design.md` |

> **Cara membaca status keputusan:** **Disepakati** = telah diputuskan dalam diskusi dan PRD; **Usulan** = rekomendasi untuk merinci implementasi, **belum disetujui**. Dokumen ini tidak mengubah keputusan terbuka di PRD secara diam-diam.

---

## 1. Prinsip produk yang tidak boleh dilanggar

1. **Satu meja = satu QR Code** yang mengarah ke halaman pemesanan meja, bukan QRIS pembayaran.
2. Pelanggan tidak membutuhkan akun atau PIN; **setelah scan QR harus mengisi nama sebelum melihat menu**. Nama disimpan pada setiap order, bukan dipakai untuk autentikasi/lokasi. Admin dan kasir harus login.
3. **Satu meja maksimal memiliki satu sesi transaksi aktif**. Semua pesanan tambahan pada sesi itu tergabung dalam satu tagihan.
4. **Tidak ada split bill atau pembayaran sebagian.** Kasir menerima satu pembayaran tunai penuh pada akhir sesi.
5. Status pelayanan pesanan hanya **`Pending → Preparing → Served`**. Konfirmasi kasir menyebabkan `Preparing`; kasir menandai Served via checklist **per baris item** dan order menjadi Served otomatis setelah seluruh baris non-void tercapai.
6. **Pembatalan hanya oleh kasir** dan hanya sebelum pembayaran: permintaan biasa dilakukan sebelum `Served`; setelah `Served`, void hanya untuk kesalahan pegawai, wajib alasan khusus dan audit. Tidak menghapus riwayat.
7. Status meja hanya **`Available`, `Occupied`, `Reserved`**. Tidak ada `Cleaning`.
8. Tidak ada kuantitas stok, pengurangan stok, ingredient, atau resep. Admin cukup mengubah ketersediaan menu **Active/Inactive**.
9. Diskon nominal tetap (Rupiah) dan pajak persentase disetel admin, dengan toggle terpisah; yang aktif diterapkan **live pada semua sesi Unpaid** setelah subtotal dihitung. Pajak dari **subtotal awal sebelum diskon**, sekali per sesi; konfigurasi dibekukan dalam snapshot pembayaran saat Paid.
10. Reservasi hanya dilakukan kasir, berdasarkan komunikasi pelanggan di luar aplikasi dan penandaan meja secara fisik.
11. Database menggunakan **NeonDB PostgreSQL**, kode dalam **modular monolith**, serta grafik dashboard custom.
12. Struk **digital preview saja** pada detail transaksi kasir; tanpa printing pada MVP.

## 2. Konsep domain dan istilah

| Istilah | Arti operasional |
|---|---|
| `Dining Table` | Identitas meja fisik, nomor unik, token QR, dan status meja. |
| `Table Session` | Satu kunjungan/penggunaan meja yang menyatukan seluruh pesanan sampai penutupan tagihan. |
| `Order` | Satu pengiriman pesanan (dari QR atau kasir) dengan nama pemesan (untuk QR), memiliki status pelayanan tersendiri. |
| `Order Item` | Satu baris menu dengan kuantitas, nama/harga snapshot, checklist `is_served`/`served_at`, dan informasi *void* jika dibatalkan; checkbox berarti seluruh kuantitas baris tersaji. |
| `Void` | Penandaan item/order dibatalkan oleh kasir sebelum pembayaran; permintaan biasa sebelum Served atau pengecualian kesalahan pegawai setelah Served. **Bukan** status pelayanan tambahan. |
| `Bill` | Total dinamis seluruh item non-void dari semua order dalam sesi, memakai setting finansial terbaru hingga Paid. |
| `Payment` | Bukti satu pembayaran tunai penuh, dengan snapshot tarif/nominal pajak, diskon, total dan cash, yang menyelesaikan sesi dan menjadi sumber struk digital. |
| `Reservation` | Catatan reservasi manual yang dibuat kasir dan disertai penanda fisik meja. |
| `Menu Availability` | Status Active/Inactive; **bukan** stok. |

**Pemisahan status wajib:** `Order.status` melacak pelayanan; `Table.status` melacak penggunaan meja; `TableSession.status` (misalnya `Active/Closed`) melacak siklus transaksi internal; pembayaran dilihat sebagai `Unpaid/Paid` berdasarkan keberadaan transaksi sukses. `Active/Closed` bukan status meja baru.

## 3. State machine

### 3.1 Status pesanan — disepakati

| Dari | Ke | Pemicu | Pelaksana | Guard |
|---|---|---|---|---|
| — | `Pending` | Checkout pelanggan berhasil | Sistem | Meja/sesi valid; menu Active; harga dihitung server; request tidak duplikat. |
| `Pending` | `Preparing` | Kasir mengonfirmasi pesanan | Kasir/Admin | Sesi aktif; pesanan masih memiliki item non-void. |
| `Preparing` | `Served` | **Semua baris item non-void** dicentang Served oleh kasir | Sistem (berdasarkan checklist kasir) | Sesi aktif; seluruh item aktif tersaji; minimal satu item non-void. |
| — | `Preparing` | Pesanan dibuat oleh kasir | Kasir/Admin | **Usulan:** entri kasir berarti sekaligus dikonfirmasi; sesi aktif. |

Tidak boleh: `Pending → Served`, `Served → Preparing`, atau status `Accepted`, `Completed`, `Cancelled` dalam enum pelayanan.

**Void seluruh pesanan:** bila semua item suatu order di-void, tandai dengan flag/rekaman *void* dan keluarkan dari daftar order aktif serta tagihan. Riwayat status terakhir tetap tersimpan. UI boleh menampilkan label “Dibatalkan” pada arsip, tetapi itu **bukan** nilai `Order.status` keempat. Ini desain teknis yang disarankan.

### 3.2 Status meja — disepakati

| Dari | Ke | Kondisi |
|---|---|---|
| `Available` | `Occupied` | Sesi transaksi pertama berhasil dibuka. **Usulan:** otomatis saat checkout pertama atau kasir membuat order manual. |
| `Available` | `Reserved` | Kasir mencatat reservasi dan menandai meja secara fisik. |
| `Reserved` | `Occupied` | Kasir melakukan check-in saat pelanggan datang. |
| `Reserved` | `Available` | Kasir membatalkan reservasi atau melepas meja, jika belum ada sesi aktif. |
| `Occupied` | `Available` | Pembayaran penuh selesai, sesi ditutup secara atomik. |

`Occupied → Available` juga diizinkan tanpa pembayaran **hanya** saat seluruh item sesi di-void dan kasir menutup sesi tanpa tagihan (audit wajib). `Occupied → Reserved` tidak diperbolehkan pada MVP. Reservasi di meja yang sedang digunakan tidak diakomodasi melalui penjadwalan otomatis. Meja `Reserved` tidak dapat langsung menerima checkout publik tanpa check-in kasir (**usulan validasi**).

### 3.3 Siklus sesi dan pembayaran

| Konsep | Nilai | Keterangan |
|---|---|---|
| Sesi | `Active`, `Closed` | Satu meja hanya boleh punya satu sesi `Active`. |
| Pembayaran | `Unpaid`, `Paid` | Status finansial; tidak mengikuti status order. |
| Penutupan normal | `Active/Unpaid → Closed/Paid` | Setelah kasir menerima pembayaran tunai penuh. |
| Penutupan tanpa tagihan | `Active/Unpaid → Closed/Unpaid` | **Disepakati:** seluruh item void, kasir menutup sesi, alasan dan audit wajib; tidak membuat payment/revenue; meja Available. |

Tidak pernah ada dua pembayaran sukses untuk satu sesi; *cash received* boleh melebihi total tagihan dan selisihnya adalah kembalian, bukan pembayaran kedua.

## 4. Katalog aturan bisnis dan penjelasan

ID `BR-01`–`BR-19` mengikuti PRD v1.0; aturan tambahan diberi ID baru.

| ID | Keputusan | Detail dan validasi |
|---|---|---|
| BR-01 | **Disepakati** | Setiap meja punya identitas QR unik; token QR acak, bukan nomor meja mentah sebagai otorisasi, dan bukan QRIS. |
| BR-02 | **Disepakati** | Maksimal satu sesi `Active` per meja; tegakkan dengan constraint database selain validasi aplikasi. |
| BR-03 | **Disepakati** | Setiap pesanan tambahan ditautkan ke sesi yang sama selama sesi masih aktif. |
| BR-04 | **Disepakati** | Status order tiga nilai; `Preparing` setelah konfirmasi; `Served` otomatis ketika semua baris item non-void telah dicentang Served oleh kasir. |
| BR-05 | **Disepakati** | Pelanggan tidak bisa cancel. Kasir memproses void sebelum Paid; sebelum Served untuk permintaan biasa, atau setelah Served **khusus kesalahan pegawai**. Seluruh alasan, jenis dan identitas kasir diaudit. |
| BR-06 | **Disepakati** | Table status tepat `Available`, `Occupied`, `Reserved`. |
| BR-07 | **Disepakati** | Satu pembayaran tunai penuh pada akhir sesi; tidak ada split/partial bill. |
| BR-08 | **Disepakati** | Payment status tidak mengikuti order/table status. |
| BR-09 | **Disepakati** | Menu Active/Inactive, tanpa manajemen stok/ingredient/resep. |
| BR-10 | **Disepakati** | Menu Inactive disembunyikan dari katalog pemesanan dan ditolak server saat checkout walaupun masih ada di cart. |
| BR-11 | **Disepakati** | Admin mengatur nominal diskon dan persentase pajak dengan toggle masing-masing. |
| BR-12 | **Disepakati** | Diskon dan pajak berlaku **sekali untuk total sesi**, bukan per order tambahan. |
| BR-13 | **Disepakati** | Diskon nominal maksimum subtotal; pajak dihitung dari **subtotal sebelum diskon** dan dibulatkan ke Rupiah. Besaran tarif admin menyesuaikan kebijakan dan ketentuan yang berlaku. |
| BR-14 | **Disepakati** | Setting diskon/pajak admin berlaku live untuk semua sesi Unpaid dan dibekukan sebagai snapshot final hanya saat Paid. |
| BR-15 | **Disepakati (integritas data)** | Nama, harga, dan kuantitas item di-snapshot pada saat order tersimpan; perubahan menu berikutnya tidak mengubah histori. |
| BR-16 | **Disepakati** | Sesi ditutup saat full payment, atau ditutup kasir tanpa pembayaran jika semua item void. Meja menjadi Available, item hilang dari daftar aktif tetapi data audit dipertahankan. |
| BR-17 | **Usulan** | Check-in kasir wajib sebelum meja Reserved berubah Occupied dan dapat mulai memesan. |
| BR-18 | **Disepakati (integritas data)** | Revenue dihitung hanya dari pembayaran berhasil; uang kembalian tidak menambah pendapatan. |
| BR-19 | **Disepakati (integritas data)** | Checkout, sesi, void, dan payment memakai transaction/constraint/idempotency yang relevan. |
| BR-20 | **Disepakati (implikasi)** | Harga/discount/tax dari input klien tidak dipercayai; server menetapkan seluruh angka final. |
| BR-21 | **Disepakati (implikasi)** | Menu yang dinonaktifkan tidak menghapus atau memodifikasi item pada order lama. |
| BR-22 | **Disepakati (implikasi)** | Reset meja tidak menghapus sesi, order, item, void, payment, atau riwayat reservasi. |
| BR-23 | **Disepakati** | Item `Served` **tidak dapat** di-void karena permintaan biasa; pengecualian hanya **kesalahan pegawai** sebelum Paid, dengan alasan khusus dan audit. |
| BR-24 | **Disepakati** | Seluruh order non-void wajib `Served` sebelum pelunasan; bila ada Pending/Preparing, tombol bayar tidak aktif dan API menolak. |
| BR-25 | **Disepakati (integritas data)** | Saat kasir membayar, backend verifikasi ulang versi bill, status order, sesi, dan total; perubahan setting/order/void memerlukan review ulang sebelum commit. |
| BR-26 | **Disepakati** | Reservasi hanya dicatat kasir setelah komunikasi eksternal; sistem tidak menerima self-booking atau mengirim WhatsApp otomatis. |
| BR-27 | **Usulan penjabaran** | Meja hanya bisa ditandai Reserved jika Available. Catatan tanggal/jam tidak memicu blokir terjadwal otomatis; status Reserved berlaku saat kasir menandainya. |
| BR-28 | **Disepakati** | Preview struk digital tersedia di detail sesi/riwayat transaksi kasir setelah Paid, dari snapshot payment; **tanpa print atau reprint** pada MVP. |
| BR-29 | **Disepakati** | Pelanggan harus mengisi nama sebelum membuka katalog setelah scan QR; nama disimpan di tiap order agar beberapa pemesan dalam satu meja tetap teridentifikasi. |
| BR-30 | **Disepakati** | Tidak ada PIN pelanggan. Nama bukan bukti kehadiran fisik, sehingga kasir tetap memverifikasi setiap order QR sebelum `Preparing`. |
| BR-31 | **Disepakati** | Kasir mencentang Served per baris item; satu baris baru selesai bila seluruh kuantitasnya sudah diantar; order Served otomatis setelah semua item non-void selesai. |
| BR-32 | **Disepakati** | Hanya bill Unpaid yang berubah mengikuti setting finansial terbaru; setelah Paid, snapshot pajak/diskon/total tidak berubah walaupun admin mengganti toggle/nilai. |
| BR-33 | **Disepakati** | Konfirmasi pembayaran penuh melakukan insert payment, close session, dan meja Available secara atomik. Semua item void memungkinkan close tanpa payment, bukan hard-delete riwayat. |

## 5. Aturan tagihan dan contoh numerik

### 5.1 Rumus dasar

```text
subtotal        = SUM(quantity × unit_price_snapshot) semua order item non-void
nominal_diskon  = min(configured_discount, subtotal) bila diskon aktif; jika tidak, 0
dasar_pajak     = subtotal  [DISEPAKATI: sebelum diskon]
pajak           = round(subtotal × tax_rate / 100) jika aktif; jika tidak, 0
total_tagihan   = subtotal - nominal_diskon + pajak
kembalian       = uang_diterima - total_tagihan
syarat bayar    = uang_diterima >= total_tagihan
```

- Semua nilai moneter disimpan sebagai **integer Rupiah**. Tidak ada biaya layanan di MVP.
- Aturan diskon/pajak berlaku pada **seluruh sesi**, jadi jangan mengurangi diskon Rp10.000 setiap ada additional order.
- Server memvalidasi nilai dan menghitung ulang tagihan pada momen payment. Pelanggan hanya melihat preview.
- Perubahan konfigurasi admin di tengah sesi **wajib memengaruhi bill Unpaid secara live**. Sesudah Paid, payment menyimpan snapshot yang tidak berubah. Bila setting/order/void berubah saat layar pembayaran dibuka, backend menolak versi bill lama dan kasir perlu review ulang nominal.

**Contoh ilustratif (bukan penentuan tarif pajak riil):**

| Komponen | Nilai |
|---|---:|
| Order awal | Rp100.000 |
| Additional order | Rp50.000 |
| Subtotal sesi | Rp150.000 |
| Diskon nominal global (aktif) | −Rp10.000 |
| Pajak contoh 10% dari **subtotal Rp150.000** | +Rp15.000 |
| **Total yang harus dibayar** | **Rp155.000** |
| Cash diterima | Rp160.000 |
| **Kembalian** | **Rp5.000** |

Jika tambahan order dibatalkan, total harus dihitung ulang berdasarkan item non-void. Data final pembayaran, pajak, diskon, dan total ditahan sebagai snapshot transaksi historis.

### 5.2 Tombol diskon/pajak admin

| Diskon | Pajak | Perilaku |
|---|---|---|
| Off | Off | Total = subtotal. |
| On | Off | Total = subtotal − diskon, maksimal diskon = subtotal. |
| Off | On | Total = subtotal + pajak. |
| On | On | Total = subtotal − diskon + pajak dari subtotal awal (sebelum diskon). |

Pengaturan berlaku **otomatis**; pelanggan tidak memasukkan kode kupon. Kasir tidak diberi override diskon individual pada MVP.


### 5.3 Konfigurasi live, versi bill, dan snapshot

- **Before Paid:** Setiap permintaan ringkasan bill membaca seluruh item non-void terbaru dan konfigurasi admin terbaru (toggle + nilai). Customer/kasir melihat **estimasi tagihan** yang bisa berubah sebelum pembayaran; update dengan refetch/polling.
- **Saat admin mengubah nilai:** Simpan `store_settings.version` bertambah; bill terkait Unpaid memakai versi baru tanpa menulis ulang tiap order/sesi. Naikkan `table_sessions.bill_revision` bila item/order berubah atau void agar perubahan harga tagihan tidak terlewat.
- **Saat konfirmasi bayar:** Kasir mengirim `expected_bill_version`/token quote yang diberikan server, yang mewakili `store_settings.version` dan `table_sessions.bill_revision`. Server mengunci/verifikasi sesi, order dan setting versi terkini, lalu menolak jika quote usang dan mengirim nominal baru untuk review; jangan auto-charge/auto-confirm cash lama.
- **After Paid:** Payment menyimpan `discount_enabled`, `discount_amount_applied`, `tax_enabled`, `tax_rate_applied`, `tax_amount`, `subtotal`, `grand_total`, `cash_received`, `change_amount` dan waktu bayar. Data historis tidak ikut toggle admin berikutnya.
- Pajak dihitung dari subtotal **sebelum** diskon. Contoh potongan sebesar seluruh subtotal masih dapat menyisakan nominal pajak; jika ingin memakai aturan berbeda untuk restoran nyata, perlu perubahan kebijakan dan cek aturan perpajakan yang relevan.
- **UX & audit:** Saat Admin menyimpan perubahan finansial, tampilkan peringatan bahwa seluruh bill Unpaid dapat berubah, serta catat pengubah/waktu/nilai lama dan baru. Tampilan pelanggan mengidentifikasi bill sebagai **estimasi hingga lunas**.

## 6. Aturan proses operasional

### 6.1 Checkout pertama dan sesi meja

**Alur baseline yang diusulkan:** setelah scan QR valid, pelanggan **mengisi nama wajib** sebelum melihat menu, tanpa PIN. Jika meja `Available` dan checkout berhasil, server membuat sesi `Active`, menyimpan order `Pending` dengan nama pemesan, dan mengubah meja `Occupied` dalam satu transaksi. Jika sudah `Occupied`, server menambahkan order ke sesi aktif yang benar. Jika `Reserved`, pelanggan diminta menghubungi kasir untuk check-in lebih dulu.

**Belum final:** siapa yang berwenang membuka sesi awal. Opsi alternatif ialah kasir membuka sesi dahulu agar QR statis tidak mudah disalahgunakan. Mekanisme pembukaan sesi tetap **wajib diputuskan** sebelum membangun endpoint checkout. Keputusan **tanpa PIN telah final**; QR statis dapat dipotret/dipakai di luar lokasi dan nama tidak membuktikan kehadiran. Gunakan token acak, rate limiting, monitoring, dan verifikasi kasir untuk menekan risiko.

### 6.2 Order manual kasir

Kasir memilih meja dan item yang Active, lalu server menyimpan order pada sesi meja. **Usulan:** order yang dimasukkan kasir langsung `Preparing`. Jika meja Available, server membuka sesi baru sebelum order tersimpan. Jika meja Reserved, kasir melakukan check-in terlebih dahulu.

### 6.3 Pembatalan/void

1. Pelanggan berbicara langsung dengan kasir untuk pembatalan biasa sebelum Served; untuk kesalahan pegawai yang diketahui setelah Served, kasir dapat memulai koreksi internal. Tidak tersedia tombol cancel pada Customer UI.
2. Kasir memilih order/item, memverifikasi permintaan, mengisi alasan, lalu mengonfirmasi.
3. Server memeriksa identitas kasir, status pembayaran, dan `Order.status`: untuk `Pending`/`Preparing`, permintaan pembatalan biasa dapat diproses; bila `Served`, **hanya kategori alasan kesalahan pegawai** yang diterima. Sebelum Paid saja.
4. Baris item ditandai void (misalnya jumlah yang batal seluruhnya untuk item tersebut); tidak melakukan delete permanen.
5. Bill sesi dihitung ulang dan log mencatat pelaku/waktu/**kategori alasan**/rincian kesalahan/nilai perubahan. Pemilihan kategori kesalahan pegawai saja tanpa penjelasan tidak cukup.
6. Untuk kebutuhan awal, pembatalan dilakukan **per baris item secara penuh**, bukan sebagian kuantitas di satu baris; split baris menjadi dua saat input bila diperlukan (**usulan penyederhanaan**).
7. Bila semua item sudah di-void, kasir dapat menutup sesi tanpa payment, meja kembali Available dan order lenyap dari daftar aktif. Simpan catatan pembatalan/penutupan dan alasan agar koreksi dapat ditelusuri; jangan hard-delete data bersejarah.

### 6.4 Pelunasan tunai, preview struk digital, dan reset meja

1. Kasir membuka ringkasan sesi; sistem menampilkan semua order awal dan tambahan.
2. **Wajib:** seluruh order aktif non-void harus `Served`; status Served didapat dengan checklist per baris item yang sudah diantar.
3. Kasir memasukkan `cash_received` ≥ `grand_total`; nominal tagihan penuh tidak bisa diedit oleh kasir.
4. Backend memeriksa versi bill terbaru (termasuk konfigurasi diskon/pajak), order bersaing dan syarat Served. Jika berubah, kirim total baru dan minta kasir review ulang. Jika tetap valid, lakukan satu transaksi atomik untuk menyimpan satu `payment` beserta snapshot finansial, menutup sesi, dan mengubah meja ke `Available`.
5. Setelah commit berhasil, UI menampilkan **preview struk digital** pada detail sesi/transaksi kasir; **tidak ada cetak atau reprint**. Refresh atau klik ulang tidak membuat payment baru.
6. Jika pembayaran gagal atau timeout, UI harus memeriksa status transaksi di server sebelum menawarkan retry, agar tidak tercatat dua kali.

### 6.5 Reservasi manual

1. Calon pelanggan menghubungi telepon/WhatsApp restoran **di luar aplikasi**.
2. Kasir memilih meja `Available`; input nama pelanggan, kontak, jumlah orang, tanggal/jam permintaan, catatan opsional.
3. Kasir menyimpan catatan dan mengubah meja `Reserved`, lalu menandai meja secara fisik.
4. Saat pelanggan datang, kasir check-in, meja menjadi `Occupied`, dan sesi dimulai atau siap dibuka (tergantung keputusan pembukaan sesi).
5. Bila batal, kasir membatalkan catatan dan melepas meja ke `Available` selama belum ada sesi aktif.
6. Tanggal/jam hanya informasi administratif; **tidak ada** jadwal otomatis, deteksi konflik lintas tanggal, atau auto-expiry pada MVP. Pemesanan mendatang dapat ditangani lewat pencatatan manual tetapi meja baru di-*hold* ketika kasir memilih menandainya Reserved; detail kebijakan hold merupakan keputusan operasional.

### 6.6 Menu, revenue, dan akses

- Menu Inactive tidak muncul di website pemesanan dan tidak bisa lolos validasi checkout; admin tetap melihat dan dapat mengaktifkannya kembali.
- Harga baru hanya memengaruhi order **setelah** perubahan; transaksi sebelumnya memakai snapshot harga order.
- Revenue dashboard berasal dari pembayaran berhasil, bukan subtotal pending/preparing/served yang belum dibayar. Jumlah transaksi = jumlah sesi yang sudah paid (bukan jumlah order tambahan).
- Akun kasir hanya menjalankan aksi POS; konfigurasi menu, akun kasir, pajak/diskon, dan laporan revenue keseluruhan hanya admin. Seluruh pengecekan izin dilakukan di backend.

## 7. Penanganan kondisi bersaing dan kegagalan

| Kondisi | Perlakuan sistem |
|---|---|
| Dua browser pertama checkout pada meja Available bersamaan | Keduanya harus memakai **satu** sesi aktif; database mencegah sesi ganda. |
| Checkout dikirim ulang karena jaringan | Gunakan idempotency key per submit; request yang sama mengembalikan hasil sama, bukan order ganda. |
| Menu menjadi Inactive ketika cart sudah terisi | Checkout ditolak untuk item itu dengan pesan minta memperbarui cart. |
| Dua kasir menekan Bayar pada sesi sama | Paling banyak satu payment sukses; kasir kedua menerima status sudah lunas. |
| Additional order masuk saat bayar sedang dieksekusi | Transaksi diserialisasikan; order hanya tersimpan jika sesi masih Active, atau ditolak bila sudah Closed. |
| Kasir membatalkan saat sesi dibayar | Void ditolak ketika payment berhasil/penutupan sesi sedang diproses. |
| Reservasi meja yang sedang Occupied/Reserved | Tolak; kasir memilih meja lain atau melepas reservation dahulu. |
| Browser melihat total usang | Server menolak `expected_bill_version` lama, mengembalikan total baru; kasir harus mengonfirmasi ulang sebelum payment. |
| Admin mengubah diskon/pajak pada sesi Unpaid | Bill otomatis memakai setting terbaru ketika data di-refresh; struk Paid tidak berubah. |
| Admin mengubah setting saat pembayaran kasir terbuka | Server menolak konfirmasi dengan quote versi lama; kasir meninjau ulang nominal. |
| Kasir membuka lagi struk setelah refresh | Preview struk digital dibaca dari payment dan item snapshot historis; tidak menciptakan payment baru. |
| User lama mengakses QR statis setelah meja direset | **Risiko tetap ada tanpa PIN** jika pembukaan sesi otomatis. Perlu memilih aktivasi sesi kasir atau menerima risiko terukur dalam demo; wajib verifikasi kasir sebelum Preparing. |

## 8. Acceptance tests (Given / When / Then)

| Test ID | Given | When | Then |
|---|---|---|---|
| AT-BR-01 | Meja 05 punya satu sesi Active | Dua order QR dikirim | Dua order berada di sesi sama dan satu bill. |
| AT-BR-02 | Order pertama `Pending` | Kasir klik konfirmasi | Status langsung `Preparing`, tanpa status `Accepted`. |
| AT-BR-03 | Order `Preparing` dengan dua baris item | Kasir mencentang satu baris Served | Order tetap Preparing; setelah semua baris non-void dicentang otomatis Served dan bill tetap Unpaid. |
| AT-BR-04 | Dua order senilai Rp100.000 dan Rp50.000; diskon Rp10.000 | Tagihan dihitung | Diskon Rp10.000 dihitung sekali untuk sesi, bukan Rp20.000. |
| AT-BR-05 | Item ada di cart pelanggan | Admin menonaktifkan item | Server menolak checkout item Inactive. |
| AT-BR-06 | Ada item yang sudah dibeli | Admin mengubah harga menu | Snapshot order lama tetap sama. |
| AT-BR-07 | Sesi belum dibayar | Kasir void satu item dengan alasan | Item tidak dihitung dan event audit tersimpan. |
| AT-BR-08 | Cash kurang dari total | Kasir submit pembayaran | Tidak tercatat payment dan sesi tetap Active. |
| AT-BR-09 | Dua request pembayaran bersamaan | Keduanya diproses | Tepat satu payment sukses; sesi Closed dan meja Available. |
| AT-BR-10 | Meja Available | Kasir membuat reservasi | Meja Reserved dan data reservasi tersimpan. |
| AT-BR-11 | Meja Reserved | Pelanggan membuka QR | Tidak dapat checkout sampai check-in (usulan). |
| AT-BR-12 | Sesi telah Paid dan Closed | QR/browser lama mencoba menambah order ke sesi lama | Server menolak modifikasi sesi lama. |
| AT-BR-13 | Order belum dibayar | Pelanggan mencoba endpoint cancel | Ditolak walaupun ia mengetahui ID pesanan. |
| AT-BR-14 | Semua item non-void `Served` | Kasir bayar penuh dan buka preview | Payment cocok dengan total, struk digital benar, meja Available. |
| AT-BR-15 | QR valid, pelanggan belum mengisi nama | Pelanggan mencoba membuka menu | Diminta nama terlebih dahulu; tidak ada PIN. |
| AT-BR-16 | Ada dua pemesan di meja sama dengan nama berbeda | Keduanya checkout | Nama tersimpan di masing-masing order; sesi/tagihan tetap satu. |
| AT-BR-17 | Item `Served` dan belum Paid | Kasir void karena pelanggan berubah pikiran | Ditolak oleh server. |
| AT-BR-18 | Item `Served` dan belum Paid, terjadi kesalahan pegawai | Kasir void dengan rincian alasan | Berhasil, audit tersimpan, total diperbarui. |
| AT-BR-19 | Subtotal Rp150.000; diskon Rp10.000; pajak 10% aktif | Backend menghitung bill | Pajak Rp15.000 dan total Rp155.000. |
| AT-BR-20 | Sesi Paid tersimpan | Kasir melihat riwayat transaksi | Preview struk muncul tanpa print dan tanpa payment baru. |
| AT-BR-21 | Sesi Unpaid subtotal Rp100.000, pajak awal Off | Admin mengaktifkan 10% | Bill tampil menjadi Rp110.000 setelah update data. |
| AT-BR-22 | Bill terbuka pada kasir; Admin mengubah diskon | Kasir konfirmasi menggunakan versi lama | Server menolak dan meminta konfirmasi ulang nominal terbaru. |
| AT-BR-23 | Transaksi Rp110.000 telah Paid | Admin mematikan pajak | Preview struk/nominal historis tetap Rp110.000. |
| AT-BR-24 | Sesi punya satu order Pending dan satu Served | Kasir mencoba bayar | Ditolak hingga semua order non-void Served. |
| AT-BR-25 | Semua item pada sesi Unpaid sudah void | Kasir menutup sesi tanpa payment | Meja Available, revenue tetap 0, tidak ada payment, riwayat/audit tetap tersedia. |

## 9. Keputusan yang masih memerlukan persetujuan

**Keputusan yang diselesaikan pada v1.2:**

| ID | Status | Keputusan |
|---|---|---|
| OD-02 | Selesai v1.1 | Pajak berdasarkan subtotal sebelum diskon. |
| OD-03 | Selesai v1.2 | Diskon/pajak live untuk sesi Unpaid, snapshot saat Paid. |
| OD-04 | Selesai v1.2 | Seluruh order non-void harus Served sebelum payment. |
| OD-05 | Selesai v1.1 | Item Served hanya boleh di-void untuk kesalahan pegawai sebelum Paid. |
| OD-06 | Selesai v1.2 | Seluruh item void → kasir tutup tanpa payment, meja Available, audit tersimpan. |
| OD-07 | Selesai v1.1 | Struk preview digital tanpa print. |

**Yang masih terbuka:**

| ID | Keputusan terbuka | Rekomendasi baseline | Dampak |
|---|---|---|---|
| OD-01 | Cara membuka sesi meja pertama | Otomatis pada checkout pertama jika Available; untuk Reserved harus check-in kasir. | UX checkout, risiko QR, endpoint. |
| OD-08 | Mitigasi QR statis tanpa PIN | Tetap tanpa PIN; rate limit, token acak, konfirmasi kasir, dan monitoring; nilai kebutuhan aktivasi sesi manual. | Risiko order palsu. |
| OD-09 | Pembatalan sebagian kuantitas pada satu baris | MVP void per baris; pecah baris di input bila perlu. | Model item dan UI kasir. |

**Catatan audit:** "Hapus pesanan tidak valid" diterapkan sebagai hilang dari tampilan aktif, bukan penghapusan permanen catatan historis. Tidak ada status order `Cancelled` tambahan.

## 10. Kriteria selesai dokumen ini

- Semua invariant pada Bagian 1 terefleksi pada ERD, route, business service, dan test.
- Tidak ada status order tambahan atau model stok/resep tersembunyi di implementasi.
- Semua keputusan berstatus Usulan dan belum terselesaikan di atas mendapat persetujuan eksplisit atau dikoreksi sebelum API/ERD dikunci.
- Skenario happy path dan edge case AT-BR-01 s.d. AT-BR-25 tersedia sebagai test plan implementasi.

**Dokumen berikutnya:** `03-user-flows.md` menguraikan *journey* masing-masing aktor berdasarkan aturan ini.
