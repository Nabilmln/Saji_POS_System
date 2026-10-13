"use client";

import { useLocale } from "@/components/locale-provider";

import { StatusBadge } from "@/components/ui/status-badge";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { usePagination } from "@/lib/use-pagination";
import { MenuCard } from "@/components/menu-card";
import { Selection, LoadingState, EmptyState, Button, Alert, Input, Pagination } from "@/components/ui/controls";
import { CustomerShell } from "@/components/app-shells";
import { cartSubtotal, changeCart, type CartItem } from "@/lib/customer/cart";

type Table = { tableNumber: string; cycleNumber: number; status: string };
type MenuItem = { id: string; name: string; description: string | null; imageUrl: string | null; priceIdr: string };
type Category = { id: string; name: string; items: MenuItem[] };
type Menu = { categories: Category[] };
type Guest = { guestToken: string; customerName: string; cycleNumber: number };
type OwnOrder = { id: string; token: string };
type OrderStatus = {
  orderId: string; tableNumber: string; customerName: string; status: "PENDING" | "PREPARING" | "SERVED";
  voided: boolean; updatedAt: string; items: { menuName: string; quantity: number; served: boolean; voided: boolean }[];
};
type ApiResult<T> = { data: T } | { error: { code: string; message: string } };
type View = "menu" | "cart" | "status";

class ApiFailure extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body = await response.json() as ApiResult<T>;
  if (!response.ok || "error" in body) {
    const code = "error" in body ? body.error.code : "REQUEST_FAILED";
    const messages: Record<string, string> = {
      INVALID_TABLE_TOKEN: "Kode QR meja tidak valid. Minta bantuan kasir.",
      TABLE_CYCLE_CHANGED: "Sesi meja telah berubah. Masukkan nama Anda lagi.",
      GUEST_SCOPE_CHANGED: "Sesi meja telah berubah. Masukkan nama Anda lagi.",
      TABLE_RESERVED: "Meja ini sedang direservasi. Minta kasir melakukan check-in.",
      MENU_UNAVAILABLE: "Ada menu yang tidak tersedia lagi. Periksa keranjang Anda.",
      SESSION_NOT_ACTIVE: "Sesi meja tidak aktif. Minta bantuan kasir.",
      RATE_LIMITED: "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.",
      INVALID_GUEST_TOKEN: "Sesi pemesanan berakhir. Masukkan nama Anda lagi.",
    };
    throw new ApiFailure(messages[code] ?? "Permintaan gagal. Periksa koneksi lalu coba lagi.", response.status);
  }
  return body.data;
}

function readSession<T>(key: string, fallback: T): T {
  try { const value = sessionStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}

export function CustomerApp({ tableToken, view }: { tableToken: string; view: View }) {
  const { t, money, locale } = useLocale();
  const router = useRouter();
  const base = `/order/${encodeURIComponent(tableToken)}`;
  const storage = `customer:${tableToken}`;
  const [table, setTable] = useState<Table | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orders, setOrders] = useState<OwnOrder[]>([]);
  const [statuses, setStatuses] = useState<Record<string, OrderStatus>>({});
  const [name, setName] = useState("");
  const { page: menuPage, setPage: setMenuPage, pageSize: menuPageSize, setPageSize: setMenuPageSize } = usePagination();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [uncertain, setUncertain] = useState(false);

  useEffect(() => {
    let active = true;
    api<Table>(`/api/public/tables/${encodeURIComponent(tableToken)}`)
      .then((data) => {
        if (!active) return;
        setTable(data);
        const savedGuest = readSession<Guest | null>(`${storage}:guest`, null);
        if (savedGuest?.cycleNumber === data.cycleNumber && savedGuest.guestToken) setGuest(savedGuest);
        else { sessionStorage.removeItem(`${storage}:guest`); sessionStorage.removeItem(`${storage}:cart`); }
        setCart(savedGuest?.cycleNumber === data.cycleNumber ? readSession<CartItem[]>(`${storage}:cart`, []) : []);
        setOrders(readSession<OwnOrder[]>(`${storage}:orders`, []));
        setUncertain(Boolean(sessionStorage.getItem(`${storage}:requestKey`)));
        if (view === "status" && sessionStorage.getItem(`${storage}:placed`) === "1") {
          setPlaced(true); sessionStorage.removeItem(`${storage}:placed`);
        }
      })
      .catch((cause: Error) => { if (active) { setOrders(readSession<OwnOrder[]>(`${storage}:orders`, [])); setError(cause.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [storage, tableToken, view]);

  useEffect(() => {
    if (table && guest) sessionStorage.setItem(`${storage}:cart`, JSON.stringify(cart));
  }, [cart, guest, storage, table]);

  const filteredMenuItems = menu?.categories.filter((category) => (!categoryId || category.id === categoryId)).flatMap((category) => category.items).filter((item) => item.name.toLocaleLowerCase("id-ID").includes(search.trim().toLocaleLowerCase("id-ID"))) ?? [];
  const currentMenuPage = Math.min(menuPage, Math.max(1, Math.ceil(filteredMenuItems.length / menuPageSize)));
  const visibleMenuIds = new Set(filteredMenuItems.slice((currentMenuPage - 1) * menuPageSize, currentMenuPage * menuPageSize).map((item) => item.id));
  const loadMenu = useCallback(async (token: string) => {
    setError("");
    try {
      const result = await api<Menu>(`/api/public/tables/${encodeURIComponent(tableToken)}/menu`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMenu(result);
    } catch (cause) {
      const message = (cause as Error).message;
      if (message.includes("Masukkan nama")) {
        sessionStorage.removeItem(`${storage}:guest`);
        setGuest(null);
      }
      setError(message);
    }
  }, [storage, tableToken]);

  useEffect(() => {
    if (!guest || view === "status" || menu) return;
    const timer = window.setTimeout(() => void loadMenu(guest.guestToken), 0);
    return () => window.clearTimeout(timer);
  }, [guest, view, menu, loadMenu]);

  const refreshStatuses = useCallback(async () => {
    const saved = readSession<OwnOrder[]>(`${storage}:orders`, []);
    if (!saved.length) return;
    const results = await Promise.allSettled(saved.map((order) =>
      api<OrderStatus>(`/api/public/orders/${encodeURIComponent(order.id)}`, {
        headers: { Authorization: `Bearer ${order.token}` },
      }),
    ));
    const next: Record<string, OrderStatus> = {};
    results.forEach((result, index) => { if (result.status === "fulfilled") next[saved[index].id] = result.value; });
    setStatuses(next);
    if (results.some((result) => result.status === "rejected")) setError("Sebagian status tidak dapat dimuat. Coba segarkan halaman.");
    else setError("");
    if (results.some((result) => result.status === "fulfilled")) setUpdatedAt(new Date());
  }, [storage]);

  useEffect(() => {
    if (view !== "status" || loading) return;
    const first = window.setTimeout(() => void refreshStatuses(), 0);
    const interval = window.setInterval(() => void refreshStatuses(), 5000);
    return () => { window.clearTimeout(first); window.clearInterval(interval); };
  }, [view, loading, refreshStatuses]);

  async function submitName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!table || !name.trim()) return;
    setBusy(true); setError("");
    try {
      const result = await api<Guest>(`/api/public/tables/${encodeURIComponent(tableToken)}/guests`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: name.trim(), expectedCycleNumber: table.cycleNumber }),
      });
      sessionStorage.setItem(`${storage}:guest`, JSON.stringify(result));
      sessionStorage.removeItem(`${storage}:cart`);
      sessionStorage.removeItem(`${storage}:orders`);
      setOrders([]); setCart([]); setGuest(result);
      if (view !== "menu") router.push(base);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  function editCart(item: CartItem, quantity: number) {
    if (uncertain) return;
    setCart((current) => changeCart(current, item, quantity));
    sessionStorage.removeItem(`${storage}:requestKey`);
  }

  async function checkout() {
    if (!table || !guest || !cart.length || busy) return;
    setBusy(true); setError("");
    const requestKey = sessionStorage.getItem(`${storage}:requestKey`) ?? crypto.randomUUID();
    sessionStorage.setItem(`${storage}:requestKey`, requestKey);
    try {
      const result = await api<{ orderId: string; orderViewToken: string }>(`/api/public/tables/${encodeURIComponent(tableToken)}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${guest.guestToken}`, "Idempotency-Key": requestKey },
        body: JSON.stringify({
          expectedCycleNumber: table.cycleNumber, clientRequestKey: requestKey,
          items: cart.map((item) => ({ menuItemId: item.id, quantity: item.quantity, ...(item.note.trim() ? { note: item.note.trim() } : {}) })),
        }),
      });
      const nextOrders = [...orders.filter((order) => order.id !== result.orderId), { id: result.orderId, token: result.orderViewToken }];
      sessionStorage.setItem(`${storage}:orders`, JSON.stringify(nextOrders));
      sessionStorage.setItem(`${storage}:placed`, "1");
      sessionStorage.removeItem(`${storage}:requestKey`);
      sessionStorage.removeItem(`${storage}:cart`);
      setOrders(nextOrders); setCart([]);
      router.push(`${base}/status`);
    } catch (cause) {
      const retryRequired = !(cause instanceof ApiFailure) || cause.status >= 500;
      setUncertain(retryRequired);
      if (!retryRequired) sessionStorage.removeItem(`${storage}:requestKey`);
      setError(retryRequired ? "Koneksi terputus. Pesanan mungkin sudah terkirim. Tekan Coba Lagi untuk memeriksa tanpa menggandakan pesanan." : (cause as Error).message);
    } finally { setBusy(false); }
  }

  if (loading) return <CustomerShell><LoadingState className="loading-block" role="status">{t("Memeriksa kode QR meja…")}</LoadingState></CustomerShell>;
  if (!table && view !== "status") return <CustomerShell><EmptyState className="empty-state"><h1>{t("Meja tidak ditemukan")}</h1><p>{error || t("Kode QR tidak valid.")}</p></EmptyState></CustomerShell>;

  const footer = view === "menu" && guest && cart.length > 0
    ? <div className="sticky-action"><Button className="primary-button full-width" onClick={() => router.push(`${base}/cart`)}><span>{t("Lihat Keranjang ·")}{" "}{cart.reduce((n, item) => n + item.quantity, 0)} {" "}{t("item")}</span><span>{money(cartSubtotal(cart))}</span></Button></div>
    : null;

  return <CustomerShell tableNumber={table?.tableNumber} footer={footer}>
    {view === "status" ? <>
      {placed && <div className="success-panel" role="status"><h1>{t("Terima kasih!")}</h1><p>{t("Pesanan Anda telah dikirim ke kasir dan menunggu konfirmasi.")}</p></div>}
      <h1>{t("Status pesanan")}</h1>
      <p className="section-intro">{t("Status diperbarui otomatis. Hanya pesanan dari browser ini yang ditampilkan.")}</p>
      {error && <Alert className="inline-alert" role="alert">{t(error)} <Button className="text-button" onClick={() => void refreshStatuses()}>{t("Coba lagi")}</Button></Alert>}
      {!orders.length ? <EmptyState className="empty-state"><h2>{t("Belum ada pesanan")}</h2><p>{t("Pesanan yang Anda kirim dari browser ini akan muncul di sini.")}</p></EmptyState>
        : orders.map((order) => {
          const status = statuses[order.id];
          return <article className="status-card" key={order.id}>
            <div className="status-top"><div><p className="context-label">{t("PESANAN #")}{order.id.slice(0, 8).toUpperCase()}</p><h2>{status ? status.customerName : t("Memuat pesanan…")}</h2></div>
              {status && <StatusBadge status={status.voided ? "VOID" : status.status} />}</div>
            {status && <><ul>{status.items.map((item, index) => <li key={index}>{item.quantity}× {item.menuName} <span className="muted">· {item.voided ? t("Dibatalkan") : item.served ? t("Sudah disajikan") : t("Belum disajikan")}</span></li>)}</ul>
              <p className="muted" style={{ marginTop: 14 }}>{status.items.filter((item) => item.served && !item.voided).length} {" "}{t("dari")}{" "}{status.items.filter((item) => !item.voided).length} {" "}{t("jenis item disajikan")}</p></>}
          </article>;
        })}
      {updatedAt && <p className="muted">{t("Terakhir diperbarui")}{" "}{updatedAt.toLocaleTimeString(locale === "en" ? "en-GB" : "id-ID", {timeZone: "Asia/Jakarta",  hour: "2-digit", minute: "2-digit" })}</p>}
      <p className="muted" style={{ marginTop: 24 }}>{t("Perlu membatalkan pesanan? Silakan hubungi kasir.")}</p>
      <Button className="secondary-button full-width" style={{ marginTop: 24 }} onClick={() => router.push(base)}>{t("Tambah pesanan")}</Button>
    </> : !table ? null : !guest ? <>
      <div className="hero-panel"><p className="context-label">{t("SELAMAT DATANG DI MEJA")}{" "}{table.tableNumber}</p><h1>{t("Mau pesan apa hari ini?")}</h1><p>{t("Isi nama Anda dulu, lalu pilih hidangan yang Anda suka.")}</p></div>
      <form onSubmit={submitName}>
        <label className="field-label" htmlFor="customer-name">{t("Nama pemesan *")}</label>
        <Input className="text-field" id="customer-name" name="customerName" placeholder={t("Contoh: Nadia")} autoComplete="name" maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} />
        {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}
        {table.status === "RESERVED" && <Alert className="inline-alert info">{t("Meja ini sedang direservasi. Kasir perlu melakukan check-in sebelum pesanan dapat dikirim.")}</Alert>}
        <Button className="primary-button full-width" style={{ marginTop: 20 }} disabled={busy || !name.trim()}>{busy ? t("Menyiapkan menu…") : t("Lihat Menu")}</Button>
      </form>
    </> : view === "cart" ? <>
      <p className="context-label">{t("MEJA")}{" "}{table.tableNumber} · {guest.customerName}</p><h1>{t("Keranjang Anda")}</h1>
      <p className="section-intro">{t("Periksa pesanan sebelum dikirim ke kasir.")}</p>
      {!cart.length ? <EmptyState className="empty-state"><h2>{t("Keranjang masih kosong")}</h2><p>{t("Pilih menu favorit Anda untuk mulai memesan.")}</p><Button className="secondary-button" onClick={() => router.push(base)}>{t("Lihat Menu")}</Button></EmptyState> : <>
        {cart.map((item) => <div className="cart-row" key={item.id}>
          <div className="cart-row-head"><strong>{item.name}</strong><span>{money(BigInt(item.priceIdr) * BigInt(item.quantity))}</span></div>
          <p className="muted">{money(item.priceIdr)} {" "}{t("per item")}</p>
          <div className="cart-controls"><div className="stepper">
            <Button type="button" aria-label={t("Kurangi {0}", { "0": item.name })} disabled={uncertain} onClick={() => editCart(item, item.quantity - 1)}>−</Button>
            <strong>{item.quantity}</strong>
            <Button type="button" aria-label={t("Tambah {0}", { "0": item.name })} disabled={uncertain || item.quantity >= 99} onClick={() => editCart(item, item.quantity + 1)}>+</Button>
          </div><Button className="text-button" disabled={uncertain} onClick={() => editCart(item, 0)}>{t("Hapus")}</Button></div>
          <Input className="text-field cart-note" aria-label={t("Catatan untuk {0}", { "0": item.name })} placeholder={t("Catatan untuk item ini (opsional)")} maxLength={500} disabled={uncertain} value={item.note} onChange={(event) => editCart({ ...item, note: event.target.value }, item.quantity)} />
        </div>)}
        <div className="summary-card"><div className="money-row"><span>{t("Subtotal menu")}</span><strong>{money(cartSubtotal(cart))}</strong></div><p className="muted">{t("Belum termasuk pajak atau diskon yang dihitung kasir pada tagihan akhir.")}</p></div>
        {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}
        {table.status === "RESERVED" && <Alert className="inline-alert info">{t("Kasir perlu melakukan check-in meja reservasi sebelum Anda dapat memesan.")}</Alert>}
        <Button className="primary-button full-width" disabled={busy || table.status === "RESERVED"} onClick={() => void checkout()}>{busy ? t("Mengirim pesanan…") : uncertain ? t("Coba Lagi dengan Aman") : t("Konfirmasi Pesanan")}</Button>
        <Button className="secondary-button full-width" style={{ marginTop: 10 }} disabled={busy || uncertain} onClick={() => router.push(base)}>{t("Kembali ke Menu")}</Button>
      </>}
    </> : <>
      <p className="context-label">{t("MEJA")}{" "}{table.tableNumber} {" "}{t("· HAI,")}{" "}{guest.customerName.toUpperCase()}</p><h1>{t("Pilih yang Anda suka.")}</h1><p className="section-intro">{t("Menu yang tersedia hari ini. Tambahkan pilihan Anda ke keranjang.")}</p>
      {uncertain && <Alert className="inline-alert" role="alert">{t("Pengiriman pesanan sebelumnya belum pasti. Buka keranjang dan coba lagi sebelum mengubah pesanan.")}{" "}<Button className="text-button" onClick={() => router.push(`${base}/cart`)}>{t("Buka keranjang")}</Button></Alert>}
      {orders.length > 0 && <Button className="text-button" onClick={() => router.push(`${base}/status`)}>{t("Lihat status pesanan saya →")}</Button>}
      <div className="menu-tools"><label htmlFor="menu-search" className="field-label">{t("Cari menu")}</label><Input id="menu-search" className="text-field" type="search" placeholder={t("Cari nama hidangan…")} value={search} onChange={(event) => { setSearch(event.target.value); setMenuPage(1); }} />
        {menu && <Selection label={t("Kategori")} value={categoryId} onChange={(value) => { setCategoryId(value); setMenuPage(1); }} options={[{ value: "", label: t("Semua") }, ...menu.categories.map((category) => ({ value: category.id, label: category.name }))]} />}</div>
      {error && <Alert className="inline-alert" role="alert">{t(error)}<Button className="text-button" onClick={() => guest && void loadMenu(guest.guestToken)}>{t("Coba lagi")}</Button></Alert>}
      {!menu && !error && <LoadingState className="loading-block" role="status">{t("Memuat menu…")}</LoadingState>}
      {menu && menu.categories.filter((category) => !categoryId || category.id === categoryId).map((category) => {
        const items = category.items.filter((item) => visibleMenuIds.has(item.id));
        if (!items.length) return null;
        return <section className="menu-section" key={category.id}><div className="menu-section-heading"><h2>{category.name}</h2><span className="muted">{items.length} {" "}{t("menu")}</span></div><div className="menu-list menu-grid">{items.map((item) => {
          const current = cart.find((entry) => entry.id === item.id);
          return <MenuCard key={item.id} menu={item}>
            <Button className="add-button" disabled={uncertain || current?.quantity === 99} onClick={() => editCart(current ?? { id: item.id, name: item.name, priceIdr: item.priceIdr, quantity: 0, note: "" }, (current?.quantity ?? 0) + 1)} aria-label={t("Tambahkan {0} ke keranjang", { "0": item.name })}>{current ? t("Tambah · {0}", { "0": current.quantity }) : t("Tambah +")}</Button>
          </MenuCard>;
        })}</div></section>;
      })}
      {menu && <Pagination pageSize={menuPageSize} onPageSizeChange={setMenuPageSize} page={currentMenuPage} hasNext={currentMenuPage * menuPageSize < filteredMenuItems.length} total={filteredMenuItems.length} onChange={setMenuPage} />}
      {menu && !menu.categories.some((category) => (!categoryId || category.id === categoryId) && category.items.some((item) => item.name.toLocaleLowerCase("id-ID").includes(search.toLocaleLowerCase("id-ID")))) && <EmptyState className="empty-state"><h2>{t("Menu tidak ditemukan")}</h2><p>{t("Coba kata lain atau pilih kategori berbeda.")}</p></EmptyState>}
    </>}
  </CustomerShell>;
}
