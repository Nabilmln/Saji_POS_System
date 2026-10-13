"use client";

import { usePolling } from "@/lib/use-polling";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";
import { changeCart, cartSubtotal, formatIdr, type CartItem } from "@/lib/customer/cart";
import { Photo } from "@/components/ui/photo";
import { Selection, Alert, Button, LoadingState, EmptyState, Panel, Input, Textarea } from "@/components/ui/controls";
import { DetailPane } from "@/components/app-shells";
import { OrderDetails, type OrderItem as Item, type StaffOrder as Order } from "@/components/order-details";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { PosBillPreview } from "@/components/pos-bill";

type Table = { id: string; tableNumber: string; status: "AVAILABLE" | "OCCUPIED" | "RESERVED"; session: { id: string; billRevision: string } | null; orders: Order[]; bill: { grandTotalIdr: string } | null };
type Menu = { categories: { id: string; name: string; items: { id: string; name: string; description: string | null; imageUrl: string | null; priceIdr: string }[] }[] };
type Draft = { customerName: string; note: string; cart: CartItem[]; key: string };

export function PosTable({ tableId }: { tableId: string }) {
  const [table, setTable] = useState<Table | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [draft, setDraft] = useState<Draft>({ customerName: "", note: "", cart: [], key: "" });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [voidItem, setVoidItem] = useState<Item | null>(null);
  const [reasonType, setReasonType] = useState<"CUSTOMER_REQUEST" | "EMPLOYEE_ERROR">("CUSTOMER_REQUEST");
  const [reason, setReason] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [closing, setClosing] = useState<"EMPTY" | "ALL_VOID" | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [search, setSearch] = useState("");
  const storageKey = `pos-manual:${tableId}`;

  const refresh = useCallback(async () => {
    try { setTable(await adminApi<Table>(`/api/staff/tables/${tableId}`)); setError(""); }
    catch { setError("Data meja belum tersinkron. Periksa koneksi lalu segarkan."); }
    finally { setReady(true); }
  }, [tableId]);
  usePolling(refresh);
  useEffect(() => {
    const initial = window.setTimeout(() => { try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved) as Draft;
        if (typeof parsed.customerName === "string" && Array.isArray(parsed.cart) && typeof parsed.key === "string") setDraft(parsed);
      }
    } catch { /* Invalid local draft is ignored. */ } }, 0);
    return () => window.clearTimeout(initial);
  }, [storageKey]);
  useEffect(() => {
    if (draft.key) sessionStorage.setItem(storageKey, JSON.stringify(draft));
  }, [draft, storageKey]);
  useEffect(() => {
    if (!showManual || menu) return;
    adminApi<Menu>("/api/staff/menus").then(setMenu).catch(() => setError("Menu belum dapat dimuat. Coba lagi."));
  }, [showManual, menu]);

  function editDraft(changes: Partial<Draft>) {
    if (busy === "manual") return;
    setDraft((current) => ({ ...current, ...changes, key: crypto.randomUUID() }));
  }
  async function mutate(path: string, init: RequestInit, action: string) {
    setBusy(action); setError(""); setNotice("");
    try { await adminApi(path, init); await refresh(); return true; }
    catch (cause) {
      await refresh();
      setError(cause instanceof AdminApiError && cause.code === "BILL_CHANGED" ? "Tagihan berubah. Periksa data terbaru sebelum mencoba lagi." : "Perubahan gagal. Segarkan data dan coba lagi.");
      return false;
    } finally { setBusy(""); }
  }
  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.cart.length) { setError("Pilih setidaknya satu menu."); return; }
    const key = draft.key || crypto.randomUUID();
    const payload = { clientRequestKey: key, customerName: draft.customerName.trim(), note: draft.note.trim(), items: draft.cart.map((item) => ({ menuItemId: item.id, quantity: item.quantity, note: item.note.trim() })) };
    setDraft((current) => ({ ...current, key }));
    sessionStorage.setItem(storageKey, JSON.stringify({ ...draft, key }));
    setBusy("manual"); setError(""); setNotice("");
    try {
      await adminApi(`/api/staff/tables/${tableId}/orders`, { ...jsonRequest("POST", payload), headers: { "Content-Type": "application/json", "Idempotency-Key": key } });
      sessionStorage.removeItem(storageKey); setDraft({ customerName: "", note: "", cart: [], key: "" }); setShowManual(false);
      setNotice("Pesanan tersimpan sebagai Menunggu. Konfirmasikan saat siap diproses."); await refresh();
    } catch (cause) {
      await refresh();
      setError(cause instanceof AdminApiError && cause.code === "MENU_UNAVAILABLE" ? "Menu berubah. Periksa ketersediaan sebelum mencoba lagi." : "Belum dapat memastikan pesanan tersimpan. Coba lagi tanpa mengubah isian untuk memakai kunci transaksi yang sama.");
    } finally { setBusy(""); }
  }
  async function submitVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!voidItem) return;
    const item = voidItem;
    if (await mutate(`/api/staff/order-items/${item.id}/void`, jsonRequest("POST", { reasonType: item.served ? "EMPLOYEE_ERROR" : reasonType, reasonDetail: reason.trim() }), `void:${item.id}`)) {
      setVoidItem(null); setReason("");
    }
  }
  async function closeSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!table?.session) return;
    const session = table.session;
    if (await mutate(`/api/staff/table-sessions/${session.id}/${closing === "EMPTY" ? "close-empty" : "close-all-void"}`, jsonRequest("POST", { expectedSessionRevision: session.billRevision, reason: closeReason.trim() }), "close")) {
      setClosing(null); setCloseReason("");
    }
  }
  const items = table?.orders.flatMap((order) => order.items) ?? [];
  const allVoid = Boolean(table?.session && items.length && items.every((item) => item.voided));
  const served = items.filter((item) => !item.voided && item.served).length;
  const active = items.filter((item) => !item.voided).length;
  return <div className="admin-stack">
    <Link className="text-button" href="/pos">← Semua meja</Link>
    {error && <Alert className="inline-alert" role="alert">{error} <Button className="text-button" onClick={() => void refresh()}>Segarkan</Button></Alert>}
    {notice && <Alert className="inline-alert info" role="status">{notice}</Alert>}
    {!ready ? <LoadingState className="loading-block" role="status">Memuat detail meja…</LoadingState> : !table ? <EmptyState className="empty-state">Meja tidak ditemukan. <Button className="text-button" onClick={() => void refresh()}>Coba lagi</Button></EmptyState> : <>
      <Panel className="admin-panel">
        <div className="admin-section-head"><div><h2>Meja {table.tableNumber}</h2></div><Button className="secondary-button" onClick={() => void refresh()}>Segarkan</Button></div>
        <p className="muted">{table.status === "AVAILABLE" ? "Tersedia" : table.status === "RESERVED" ? "Dipesan · check-in diperlukan sebelum order manual" : "Terisi"}{table.session ? ` · Sesi ${table.session.id.slice(0, 8)}` : ""}</p>
        <div className="pos-summary"><div><span>Total tagihan saat ini</span><strong>{formatIdr(table.bill?.grandTotalIdr ?? "0")}</strong></div><div><span>Item tersaji</span><strong>{served} / {active}</strong></div></div>
        <div className="admin-actions"><Button className="primary-button" disabled={table.status === "RESERVED"} onClick={() => setShowManual((current) => !current)}>{showManual ? "Tutup form order" : "Tambah order manual"}</Button>{allVoid && <Button className="secondary-button danger-text" onClick={() => setClosing("ALL_VOID")}>Tutup sesi tanpa pembayaran</Button>}{table.session && !table.orders.length && <Button className="secondary-button danger-text" onClick={() => setClosing("EMPTY")}>Tutup sesi kosong</Button>}</div>
      </Panel>
      {table.session && <PosBillPreview key={table.session.id} sessionId={table.session.id} />}
      {showManual && <Panel className="admin-panel"><h2>Order manual</h2><p className="muted">Order baru masuk status Menunggu dan perlu dikonfirmasi.</p>
        <form onSubmit={(event) => void submitManual(event)}>
          <div className="admin-form-grid"><label>Nama pelanggan / label<Input className="text-field" required maxLength={120} value={draft.customerName} onChange={(event) => editDraft({ customerName: event.target.value })} /></label><label>Catatan order (opsional)<Input className="text-field" maxLength={500} value={draft.note} onChange={(event) => editDraft({ note: event.target.value })} /></label></div>
          <label className="field-label">Cari menu<Input className="text-field" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama menu" /></label>
          {!menu ? <p className="muted">Memuat menu… <Button type="button" className="text-button" onClick={() => { setMenu(null); adminApi<Menu>("/api/staff/menus").then(setMenu).catch(() => setError("Menu belum dapat dimuat.")); }}>Coba lagi</Button></p> : menu.categories.map((category) => {
            const listed = category.items.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase()));
            return listed.length ? <div key={category.id} className="pos-menu-group"><h3>{category.name}</h3>{listed.map((item) => {
              const selected = draft.cart.find((entry) => entry.id === item.id);
              const cartItem: CartItem = { id: item.id, name: item.name, priceIdr: item.priceIdr, quantity: selected?.quantity ?? 0, note: selected?.note ?? "" };
              return <div className="pos-menu-row" key={item.id}><Photo src={item.imageUrl} className="pos-menu-image" /><div className="pos-menu-copy"><strong>{item.name}</strong>{item.description && <p className="muted">{item.description}</p>}<p className="muted">{formatIdr(item.priceIdr)}</p></div><div className="stepper"><Button type="button" aria-label={`Kurangi ${item.name}`} disabled={!selected} onClick={() => editDraft({ cart: changeCart(draft.cart, cartItem, cartItem.quantity - 1) })}>−</Button><span>{cartItem.quantity}</span><Button type="button" aria-label={`Tambah ${item.name}`} disabled={cartItem.quantity >= 99} onClick={() => editDraft({ cart: changeCart(draft.cart, cartItem, cartItem.quantity + 1) })}>+</Button></div></div>;
            })}</div> : null;
          })}
          {draft.cart.length > 0 && <div className="summary-card"><h3>Ringkasan order</h3>{draft.cart.map((item) => <div className="cart-row" key={item.id}><div className="cart-row-head"><strong>{item.quantity}× {item.name}</strong><span>{formatIdr(BigInt(item.priceIdr) * BigInt(item.quantity))}</span></div><Input className="text-field cart-note" aria-label={`Catatan ${item.name}`} maxLength={500} placeholder="Catatan item (opsional)" value={item.note} onChange={(event) => editDraft({ cart: draft.cart.map((entry) => entry.id === item.id ? { ...entry, note: event.target.value } : entry) })} /></div>)}<div className="money-row"><strong>Subtotal menu</strong><strong>{formatIdr(cartSubtotal(draft.cart))}</strong></div></div>}
          <div className="admin-actions"><Button className="primary-button" disabled={busy === "manual" || !draft.cart.length || !menu}>{busy === "manual" ? "Menyimpan…" : "Simpan order Menunggu"}</Button></div>
        </form>
      </Panel>}
      <DetailPane><OrderDetails orders={table.orders} busy={busy}
        onConfirm={(id) => void mutate(`/api/staff/orders/${id}/confirm`, jsonRequest("POST", {}), `confirm:${id}`)}
        onServe={(id) => void mutate(`/api/staff/order-items/${id}/served`, jsonRequest("PATCH", { served: true }), `served:${id}`)}
        onVoid={(item) => { setVoidItem(item); setReasonType(item.served ? "EMPLOYEE_ERROR" : "CUSTOMER_REQUEST"); setReason(""); }}
      /></DetailPane>
      {voidItem && <ConfirmationDialog titleId="void-title" onClose={() => setVoidItem(null)}><h2 id="void-title">Batalkan item</h2><p>{voidItem.quantity}× {voidItem.menuName}. Tagihan akan dihitung ulang.</p>{error && <Alert className="inline-alert" role="alert">{error}</Alert>}<form onSubmit={(event) => void submitVoid(event)}>{voidItem.served ? <p className="inline-alert">Item sudah tersaji. Hanya dapat dibatalkan karena kesalahan pegawai.</p> : <Selection label="Alasan" value={reasonType} onChange={(value) => setReasonType(value as typeof reasonType)} options={[{ value: "CUSTOMER_REQUEST", label: "Permintaan pelanggan" }, { value: "EMPLOYEE_ERROR", label: "Kesalahan pegawai" }]} />}<label className="field-label">Penjelasan<Textarea className="text-field" minLength={5} maxLength={500} required value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="admin-actions"><Button type="button" className="secondary-button" onClick={() => setVoidItem(null)}>Kembali</Button><Button className="primary-button" disabled={Boolean(busy)}>Batalkan item</Button></div></form></ConfirmationDialog>}
      {closing && table.session && <ConfirmationDialog titleId="close-title" onClose={() => setClosing(null)}><h2 id="close-title">Tutup sesi tanpa pembayaran?</h2><p>{closing === "EMPTY" ? "Sesi belum berisi pesanan." : "Semua item dibatalkan."} Meja akan kembali tersedia tanpa membuat pembayaran.</p>{error && <Alert className="inline-alert" role="alert">{error}</Alert>}<form onSubmit={(event) => void closeSession(event)}><label className="field-label">Alasan penutupan<Textarea className="text-field" minLength={5} maxLength={500} required value={closeReason} onChange={(event) => setCloseReason(event.target.value)} /></label><div className="admin-actions"><Button type="button" className="secondary-button" onClick={() => setClosing(null)}>Kembali</Button><Button className="primary-button" disabled={Boolean(busy)}>Tutup sesi</Button></div></form></ConfirmationDialog>}
    </>}
  </div>;
}
