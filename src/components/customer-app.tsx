"use client";

import { useLocale } from "@/components/locale-provider";

import { StatusBadge } from "@/components/ui/status-badge";
import { MinusIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { Photo } from "@/components/ui/photo";
import "./menu-card-stepper.css";
import "./customer-cart.css";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MenuCard } from "@/components/menu-card";
import { Selection, LoadingState, EmptyState, Button, Alert, Input } from "@/components/ui/controls";
import { CustomerShell } from "@/components/app-shells";
import { cartSubtotal, changeCart, type CartItem } from "@/lib/customer/cart";
import { randomId } from "@/lib/random-id";
import { usePolling } from "@/lib/use-polling";
import { CustomerCompletion } from "@/components/customer-completion";

type Table = { tableNumber: string; cycleNumber: number; status: string };
type MenuItem = { id: string; name: string; description: string | null; imageUrl: string | null; priceIdr: string };
type Category = { id: string; name: string; items: MenuItem[] };
type Menu = { categories: Category[] };
type Guest = { guestToken: string; customerName: string; cycleNumber: number };
type OwnOrder = { id: string; token: string };
type OrderStatus = {
  orderId: string; tableNumber: string; customerName: string; status: "PENDING" | "PREPARING" | "SERVED";
  voided: boolean; updatedAt: string; items: { menuName: string; quantity: number; served: boolean; voided: boolean }[];
  session: { status: "OPEN" | "PAID" | "CLOSED"; closedAt: string | null };
};
type Completion = { status: "PAID" | "CLOSED"; customerName: string; tableNumber: string };
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
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [placed, setPlaced] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const checkoutInFlight = useRef(false);
  const statusRequests = useRef<AbortController | null>(null);
  const [completion, setCompletion] = useState<Completion | null>(null);
  const visitEnded = useRef(false);

  useEffect(() => {
    const controller = new AbortController(); statusRequests.current = controller;
    return () => controller.abort();
  }, [storage, view]);

  useEffect(() => {
    let active = true;
    const finished = readSession<Completion | null>(`${storage}:completion`, null);
    if (finished && view !== "menu") {
      visitEnded.current = true;
      const timer = window.setTimeout(() => { setCompletion(finished); setLoading(false); }, 0);
      return () => { active = false; window.clearTimeout(timer); };
    }
    // The QR's menu URL is the entry point for a new visit after completion.
    if (finished && view === "menu") sessionStorage.removeItem(`${storage}:completion`);
    api<Table>(`/api/public/tables/${encodeURIComponent(tableToken)}`)
      .then((data) => {
        if (!active) return;
        setTable(data);
        const savedGuest = readSession<Guest | null>(`${storage}:guest`, null);
        if (savedGuest?.cycleNumber === data.cycleNumber && savedGuest.guestToken) setGuest(savedGuest);
        else { sessionStorage.removeItem(`${storage}:guest`); sessionStorage.removeItem(`${storage}:cart`); }
        setCart(savedGuest?.cycleNumber === data.cycleNumber ? readSession<CartItem[]>(`${storage}:cart`, []) : []);
        const newVisit = view === "menu" && savedGuest && savedGuest.cycleNumber !== data.cycleNumber;
        if (newVisit) for (const key of ["orders", "requestKey", "placed"]) sessionStorage.removeItem(`${storage}:${key}`);
        setOrders(newVisit ? [] : readSession<OwnOrder[]>(`${storage}:orders`, []));
        setUncertain(!newVisit && Boolean(sessionStorage.getItem(`${storage}:requestKey`)));
        if (view === "status" && sessionStorage.getItem(`${storage}:placed`) === "1") {
          setPlaced(true); sessionStorage.removeItem(`${storage}:placed`);
        }
      })
      .catch((cause: Error) => { if (active) { setOrders(readSession<OwnOrder[]>(`${storage}:orders`, [])); setError(cause.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [storage, tableToken, view]);

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
    if (loading || completion) return;
    const saved = readSession<OwnOrder[]>(`${storage}:orders`, []);
    if (!saved.length) return;
    const signal = statusRequests.current?.signal;
    const results = await Promise.allSettled(saved.map((order) =>
      api<OrderStatus>(`/api/public/orders/${encodeURIComponent(order.id)}`, {
        headers: { Authorization: `Bearer ${order.token}` }, signal,
      }),
    ));
    if (signal?.aborted) return;
    const finished = results.find((result) => result.status === "fulfilled" && result.value.session.status !== "OPEN");
    if (finished?.status === "fulfilled" && finished.value.session.status !== "OPEN") {
      visitEnded.current = true;
      const end: Completion = { status: finished.value.session.status, customerName: finished.value.customerName, tableNumber: finished.value.tableNumber };
      try {
        sessionStorage.setItem(`${storage}:completion`, JSON.stringify(end));
        for (const key of ["guest", "cart", "orders", "requestKey", "placed"]) sessionStorage.removeItem(`${storage}:${key}`);
      } catch { /* Server cycle checks still reject the expired ordering credentials. */ }
      statusRequests.current?.abort();
      setCompletion(end); setGuest(null); setCart([]); setMenu(null); setOrders([]); setStatuses({}); setUncertain(false); setPlaced(false); setError("");
      if (view !== "status") router.replace(`${base}/status`);
      return;
    }
    const next: Record<string, OrderStatus> = {};
    results.forEach((result, index) => { if (result.status === "fulfilled") next[saved[index].id] = result.value; });
    setStatuses(next);
    if (results.some((result) => result.status === "rejected")) setError("Sebagian status tidak dapat dimuat. Coba segarkan halaman.");
    else setError("");
    if (results.some((result) => result.status === "fulfilled")) setUpdatedAt(new Date());
  }, [storage, loading, completion, view, router, base]);
  usePolling(refreshStatuses);

  async function submitName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!table || !name.trim() || visitEnded.current) return;
    setBusy(true); setError("");
    try {
      const result = await api<Guest>(`/api/public/tables/${encodeURIComponent(tableToken)}/guests`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerName: name.trim(), expectedCycleNumber: table.cycleNumber }),
      });
      if (visitEnded.current) return;
      sessionStorage.setItem(`${storage}:guest`, JSON.stringify(result));
      sessionStorage.removeItem(`${storage}:cart`);
      sessionStorage.removeItem(`${storage}:orders`);
      setOrders([]); setCart([]); setGuest(result);
      if (view !== "menu") router.push(base);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  function editCart(item: CartItem, quantity: number) {
    if (uncertain || busy || visitEnded.current) return;
    const resolvedImageUrl = item.imageUrl ?? menu?.categories.flatMap((c) => c.items).find((m) => m.id === item.id)?.imageUrl ?? null;
    const itemWithImage = { ...item, ...(resolvedImageUrl !== undefined ? { imageUrl: resolvedImageUrl } : {}) };
    const next = changeCart(cart, itemWithImage, quantity);
    sessionStorage.setItem(`${storage}:cart`, JSON.stringify(next));
    setCart(next);
    sessionStorage.removeItem(`${storage}:requestKey`);
  }

  async function checkout() {
    if (!table || !guest || !cart.length || checkoutInFlight.current || visitEnded.current) return;
    checkoutInFlight.current = true;
    setBusy(true); setError("");
    const requestKey = sessionStorage.getItem(`${storage}:requestKey`) ?? randomId();
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
      if (visitEnded.current) return;
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
    } finally { checkoutInFlight.current = false; setBusy(false); }
  }

  if (loading) return <CustomerShell><LoadingState className="loading-block" role="status">{t("Memeriksa kode QR meja…")}</LoadingState></CustomerShell>;
  if (completion) return <CustomerShell tableNumber={completion.tableNumber}><CustomerCompletion paid={completion.status === "PAID"} customerName={completion.customerName} /></CustomerShell>;
  if (!table && view !== "status") return <CustomerShell><EmptyState className="empty-state"><h1>{t("Meja tidak ditemukan")}</h1><p>{error || t("Kode QR tidak valid.")}</p></EmptyState></CustomerShell>;

  const footer = view === "menu" && guest && cart.length > 0
    ? <div className="sticky-action"><Button className="primary-button full-width" onClick={() => router.push(`${base}/cart`)}><span>{t("Lihat Keranjang ·")}{" "}{cart.reduce((n, item) => n + item.quantity, 0)} {" "}{t("item")}</span><span>{money(cartSubtotal(cart))}</span></Button></div>
    : null;

  return <CustomerShell tableNumber={table?.tableNumber} footer={footer} revision={JSON.stringify([cart, statuses])}>
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
      {!cart.length ? (
        <EmptyState className="empty-state">
          <h2>{t("Keranjang masih kosong")}</h2>
          <p>{t("Pilih menu favorit Anda untuk mulai memesan.")}</p>
          <Button className="secondary-button" onClick={() => router.push(base)}>{t("Lihat Menu")}</Button>
        </EmptyState>
      ) : (
        <>
          <div className="customer-receipt-card">
            <div className="receipt-card-header">
              <div className="receipt-card-meta">
                <span className="receipt-card-table-badge">{t("MEJA")}{" "}{table.tableNumber}</span>
                <span className="receipt-card-guest-name">{guest.customerName}</span>
              </div>
              <span className="receipt-card-count-badge">
                {cart.reduce((n, item) => n + item.quantity, 0)} {t("item")}
              </span>
            </div>
            <div className="receipt-card-items">
              {cart.map((item) => {
                const itemImageUrl = item.imageUrl ?? menu?.categories.flatMap((c) => c.items).find((m) => m.id === item.id)?.imageUrl ?? null;
                return (
                  <div className="receipt-item-row" key={item.id}>
                    <Photo
                      src={itemImageUrl}
                      menuName={item.name}
                      alt={item.name}
                      className="receipt-item-photo"
                    />
                    <div className="receipt-item-body">
                      <div className="receipt-item-top">
                        <strong className="receipt-item-name">{item.name}</strong>
                        <div className="receipt-item-price-block">
                          {item.quantity > 1 && (
                            <span className="receipt-item-calc">
                              {money(item.priceIdr)} x {item.quantity}
                            </span>
                          )}
                          <span className="receipt-item-total">
                            {money(BigInt(item.priceIdr) * BigInt(item.quantity))}
                          </span>
                        </div>
                      </div>
                      <div className="receipt-item-controls">
                        <div className="receipt-stepper" role="group" aria-label={t("Ubah jumlah {0}", { "0": item.name })}>
                          <button
                            type="button"
                            className="receipt-stepper-btn"
                            disabled={uncertain}
                            onClick={() => editCart(item, item.quantity - 1)}
                            aria-label={t("Kurangi {0}", { "0": item.name })}
                          >
                            <MinusIcon size={12} weight="bold" />
                          </button>
                          <span className="receipt-stepper-qty" aria-live="polite">{item.quantity}</span>
                          <button
                            type="button"
                            className="receipt-stepper-btn"
                            disabled={uncertain || item.quantity >= 99}
                            onClick={() => editCart(item, item.quantity + 1)}
                            aria-label={t("Tambah {0}", { "0": item.name })}
                          >
                            <PlusIcon size={12} weight="bold" />
                          </button>
                        </div>
                        <button
                          type="button"
                          className="receipt-item-remove"
                          disabled={uncertain}
                          onClick={() => editCart(item, 0)}
                          aria-label={t("Hapus {0}", { "0": item.name })}
                        >
                          <TrashIcon size={14} weight="regular" />
                          <span>{t("Hapus")}</span>
                        </button>
                      </div>
                      <Input
                        className="text-field receipt-note-input"
                        aria-label={t("Catatan untuk {0}", { "0": item.name })}
                        placeholder={t("Catatan untuk item ini (opsional)")}
                        maxLength={500}
                        disabled={uncertain}
                        value={item.note}
                        onChange={(event) => editCart({ ...item, note: event.target.value }, item.quantity)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="receipt-card-summary">
              <div className="receipt-summary-line">
                <span>{t("Total item")}</span>
                <span>{cart.reduce((n, item) => n + item.quantity, 0)}</span>
              </div>
              <div className="receipt-summary-line total">
                <span>{t("Subtotal")}</span>
                <span className="receipt-summary-subtotal">{money(cartSubtotal(cart))}</span>
              </div>
            </div>
          </div>
          {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}
          {table.status === "RESERVED" && <Alert className="inline-alert info">{t("Kasir perlu melakukan check-in meja reservasi sebelum Anda dapat memesan.")}</Alert>}
          <div className="receipt-actions">
            <Button className="primary-button full-width" disabled={busy || table.status === "RESERVED"} onClick={() => void checkout()}>{busy ? t("Mengirim pesanan…") : uncertain ? t("Coba Lagi dengan Aman") : t("Konfirmasi Pesanan")}</Button>
            <Button className="secondary-button full-width" disabled={busy || uncertain} onClick={() => router.push(base)}>{t("Kembali ke Menu")}</Button>
          </div>
        </>
      )}
    </> : <>
      <p className="context-label">{t("MEJA")}{" "}{table.tableNumber} {" "}{t("· HAI,")}{" "}{guest.customerName.toUpperCase()}</p><h1>{t("Pilih yang Anda suka.")}</h1><p className="section-intro">{t("Menu yang tersedia hari ini. Tambahkan pilihan Anda ke keranjang.")}</p>
      {uncertain && <Alert className="inline-alert" role="alert">{t("Pengiriman pesanan sebelumnya belum pasti. Buka keranjang dan coba lagi sebelum mengubah pesanan.")}{" "}<Button className="text-button" onClick={() => router.push(`${base}/cart`)}>{t("Buka keranjang")}</Button></Alert>}
      {orders.length > 0 && <Button className="text-button" onClick={() => router.push(`${base}/status`)}>{t("Lihat status pesanan saya →")}</Button>}
      <div className="menu-tools"><label htmlFor="menu-search" className="field-label">{t("Cari menu")}</label><Input id="menu-search" className="text-field" type="search" placeholder={t("Cari nama hidangan…")} value={search} onChange={(event) => setSearch(event.target.value)} />
        {menu && <Selection label={t("Kategori")} value={categoryId} onChange={(value) => setCategoryId(value)} options={[{ value: "", label: t("Semua") }, ...menu.categories.map((category) => ({ value: category.id, label: category.name }))]} />}</div>
      {error && <Alert className="inline-alert" role="alert">{t(error)}<Button className="text-button" onClick={() => guest && void loadMenu(guest.guestToken)}>{t("Coba lagi")}</Button></Alert>}
      {!menu && !error && <LoadingState variant="menu">{t("Memuat menu…")}</LoadingState>}
      {menu && menu.categories.filter((category) => !categoryId || category.id === categoryId).map((category) => {
        const query = search.trim().toLocaleLowerCase("id-ID");
        const items = category.items.filter((item) => !query || item.name.toLocaleLowerCase("id-ID").includes(query));
        if (!items.length) return null;
        return <section className="menu-section" key={category.id}><div className="menu-section-heading"><h2>{category.name}</h2><span className="muted">{items.length} {" "}{t("menu")}</span></div><div className="menu-list menu-grid">{items.map((item) => {
          const current = cart.find((entry) => entry.id === item.id);
          return <MenuCard key={item.id} menu={item} category={category.name}>
            {current && current.quantity > 0 ? (
              <div
                className="menu-card-stepper"
                role="group"
                aria-label={t("Tambahkan {0} ke keranjang", { "0": item.name })}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="menu-stepper-btn"
                  disabled={uncertain}
                  onClick={() => editCart(current, current.quantity - 1)}
                  aria-label={t("Kurangi {0}", { "0": item.name })}
                >
                  <MinusIcon size={14} weight="bold" />
                </button>
                <span className="menu-stepper-qty" aria-live="polite">
                  {current.quantity}
                </span>
                <button
                  type="button"
                  className="menu-stepper-btn"
                  disabled={uncertain || current.quantity >= 99}
                  onClick={() => editCart(current, current.quantity + 1)}
                  aria-label={t("Tambah {0}", { "0": item.name })}
                >
                  <PlusIcon size={14} weight="bold" />
                </button>
              </div>
            ) : (
              <Button
                className="add-button full-width"
                disabled={uncertain}
                onClick={() => editCart(current ?? { id: item.id, name: item.name, priceIdr: item.priceIdr, quantity: 0, note: "", imageUrl: item.imageUrl }, 1)}
                aria-label={t("Tambahkan {0} ke keranjang", { "0": item.name })}
              >
                <PlusIcon size={14} weight="bold" />
                <span>{t("Tambah")}</span>
              </Button>
            )}
          </MenuCard>;
        })}</div></section>;
      })}
      {menu && !menu.categories.some((category) => (!categoryId || category.id === categoryId) && category.items.some((item) => item.name.toLocaleLowerCase("id-ID").includes(search.toLocaleLowerCase("id-ID")))) && <EmptyState className="empty-state"><h2>{t("Menu tidak ditemukan")}</h2><p>{t("Coba kata lain atau pilih kategori berbeda.")}</p></EmptyState>}
    </>}
  </CustomerShell>;
}
