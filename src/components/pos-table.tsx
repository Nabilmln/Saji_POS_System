"use client";

import { Text, useLocale } from "@/components/locale-provider";
import { useNotice, statusNotice } from "@/components/ui/notice";

import { usePolling } from "@/lib/use-polling";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";
import { changeCart, cartSubtotal, type CartItem } from "@/lib/customer/cart";
import { usePagination } from "@/lib/use-pagination";
import { MenuCard } from "@/components/menu-card";
import { Alert, Button, LoadingState, EmptyState, Panel, Input, Textarea, Pagination } from "@/components/ui/controls";
import { DetailPane } from "@/components/app-shells";
import { OrderDetails, type OrderItem as Item, type StaffOrder as Order } from "@/components/order-details";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { PosBillPreview } from "@/components/pos-bill";
import { PosTableActions } from "@/components/pos-table-actions";
import { ReceiptPreview } from "@/components/pos-receipt";
import { OrderItemDeletion } from "@/components/order-item-deletion";

export type StaffTable = { id: string; tableNumber: string; status: "AVAILABLE" | "OCCUPIED" | "RESERVED"; session: { id: string; billRevision: string } | null; orders: Order[]; bill: { subtotalIdr: string; grandTotalIdr: string } | null };
type Menu = { categories: { id: string; name: string; items: { id: string; name: string; description: string | null; imageUrl: string | null; priceIdr: string }[] }[] };
type Draft = { customerName: string; note: string; cart: CartItem[]; key: string; uncertain?: boolean };

export function PosTable({ tableId, onClose, onPayment, initialManual = false }: { tableId: string; onClose?: () => void; onPayment?: (sessionId: string) => void; initialManual?: boolean }) {
  const { t, money } = useLocale();
  const [table, setTable] = useState<StaffTable | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [menuError, setMenuError] = useState("");
  const [draft, setDraft] = useState<Draft>({ customerName: "", note: "", cart: [], key: "" });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const setNotice = useNotice();
  const [busy, setBusy] = useState("");
  const [voidItem, setVoidItem] = useState<Item | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [closing, setClosing] = useState<"EMPTY" | "ALL_VOID" | null>(null);
  const [showManual, setShowManual] = useState(initialManual);
  const [receiptSessionId, setReceiptSessionId] = useState("");
  const manualInFlight = useRef(false);
  const { page: menuPage, setPage: setMenuPage, pageSize: menuPageSize, setPageSize: setMenuPageSize } = usePagination();
  const [search, setSearch] = useState("");
  const filteredMenuItems = menu?.categories.flatMap((category) => category.items).filter((item) => item.name.toLocaleLowerCase("id-ID").includes(search.trim().toLocaleLowerCase("id-ID"))) ?? [];
  const currentMenuPage = Math.min(menuPage, Math.max(1, Math.ceil(filteredMenuItems.length / menuPageSize)));
  const visibleMenuIds = new Set(filteredMenuItems.slice((currentMenuPage - 1) * menuPageSize, currentMenuPage * menuPageSize).map((item) => item.id));
  const storageKey = `pos-manual:${tableId}`;

  const refresh = useCallback(async () => {
    try { setTable(await adminApi<StaffTable>(`/api/staff/tables/${tableId}`)); setError(""); }
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
  const loadMenu = useCallback(async () => {
    setMenuError("");
    try { setMenu(await adminApi<Menu>("/api/staff/menus")); }
    catch { setMenuError("Menu belum dapat dimuat. Coba lagi."); }
  }, []);
  useEffect(() => {
    if (!showManual || menu) return;
    const timer = window.setTimeout(() => void loadMenu(), 0);
    return () => window.clearTimeout(timer);
  }, [showManual, menu, loadMenu]);

  function editDraft(changes: Partial<Draft>) {
    if (manualInFlight.current || draft.uncertain) return;
    const next = { ...draft, ...changes, key: crypto.randomUUID() };
    sessionStorage.setItem(storageKey, JSON.stringify(next));
    setDraft(next);
  }
  async function mutate(path: string, init: RequestInit, action: string) {
    setBusy(action); setError(""); setNotice("");
    try {
      await adminApi(path, init); await refresh();
      if (action !== "close") {
        const id = action.split(":")[1];
        const item = table?.orders.flatMap((order) => order.items).find((item) => item.id === id);
        setNotice(statusNotice(action.startsWith("confirm:") ? <Text value={`Pesanan ${id.slice(0, 8)}`} /> : item?.menuName ?? <Text value="Item" />, action.startsWith("confirm:") ? "Sedang disiapkan" : "Sudah disajikan"));
      }
      return true;
    }
    catch (cause) {
      await refresh();
      setError(cause instanceof AdminApiError && cause.code === "BILL_CHANGED" ? "Tagihan berubah. Periksa data terbaru sebelum mencoba lagi." : "Perubahan gagal. Segarkan data dan coba lagi.");
      return false;
    } finally { setBusy(""); }
  }
  async function submitManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (manualInFlight.current) return;
    if (!draft.cart.length) { setError("Pilih setidaknya satu menu."); return; }
    const key = draft.key || crypto.randomUUID();
    const payload = { clientRequestKey: key, customerName: draft.customerName.trim(), note: draft.note.trim(), items: draft.cart.map((item) => ({ menuItemId: item.id, quantity: item.quantity, note: item.note.trim() })) };
    manualInFlight.current = true;
    setDraft({ ...draft, key, uncertain: true });
    sessionStorage.setItem(storageKey, JSON.stringify({ ...draft, key, uncertain: true }));
    setBusy("manual"); setError(""); setNotice("");
    try {
      await adminApi(`/api/staff/tables/${tableId}/orders`, { ...jsonRequest("POST", payload), headers: { "Content-Type": "application/json", "Idempotency-Key": key } });
      sessionStorage.removeItem(storageKey); setDraft({ customerName: "", note: "", cart: [], key: "" }); setShowManual(false);
      setNotice({ text: "Pesanan tersimpan sebagai {0}. Konfirmasikan saat siap diproses.", values: { 0: <Text value="Menunggu" /> }, subject: table && <Text value={`Meja ${table.tableNumber}`} /> }); await refresh();
    } catch (cause) {
      await refresh();
      if (cause instanceof AdminApiError && ["MENU_UNAVAILABLE", "VALIDATION_ERROR", "TABLE_RESERVED", "TABLE_NOT_FOUND"].includes(cause.code)) {
        const editable = { ...draft, key, uncertain: false };
        setDraft(editable); sessionStorage.setItem(storageKey, JSON.stringify(editable));
      }
      setError(cause instanceof AdminApiError && cause.code === "MENU_UNAVAILABLE" ? "Menu berubah. Periksa ketersediaan sebelum mencoba lagi." : "Belum dapat memastikan pesanan tersimpan. Coba lagi tanpa mengubah isian untuk memakai kunci transaksi yang sama.");
    } finally { manualInFlight.current = false; setBusy(""); }
  }
  async function closeSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!table?.session) return;
    const session = table.session;
    if (await mutate(`/api/staff/table-sessions/${session.id}/${closing === "EMPTY" ? "close-empty" : "close-all-void"}`, jsonRequest("POST", { expectedSessionRevision: session.billRevision, reason: closeReason.trim() }), "close")) {
      setClosing(null); setCloseReason("");
      setNotice({ text: "Sesi {0} ditutup. Meja kembali tersedia.", values: { 0: <Text value={`Meja ${table.tableNumber}`} /> } });
    }
  }
  const items = table?.orders.flatMap((order) => order.items) ?? [];
  const allVoid = Boolean(table?.session && items.length && items.every((item) => item.voided));
  return <div className="admin-stack">
    {onClose ? <Button className="text-button" disabled={!!busy} onClick={onClose}>{t("← Semua meja")}</Button> : <Link className="text-button" href="/pos">{t("← Semua meja")}</Link>}
    {error && <Alert className="inline-alert" role="alert">{t(error)} <Button className="text-button" onClick={() => void refresh()}>{t("Segarkan")}</Button></Alert>}

    {!ready ? <LoadingState className="loading-block" role="status">{t("Memuat detail meja…")}</LoadingState> : !table ? <EmptyState className="empty-state">{t("Meja tidak ditemukan.")}{" "}<Button className="text-button" onClick={() => void refresh()}>{t("Coba lagi")}</Button></EmptyState> : <>
      <Panel className="admin-panel">
        <div className="admin-section-head"><div><h2>{t("Meja")}{" "}{table.tableNumber}</h2></div><Button className="secondary-button" onClick={() => void refresh()}>{t("Segarkan")}</Button></div>
        <p className="muted">{table.status === "AVAILABLE" ? t("Tersedia") : table.status === "RESERVED" ? t("Dipesan · check-in diperlukan sebelum order manual") : t("Terisi")}{table.session ? t(" · Sesi {0}", { "0": table.session.id.slice(0, 8) }) : ""}</p>
        <div className="admin-actions">{allVoid && <Button className="secondary-button danger-text" onClick={() => setClosing("ALL_VOID")}>{t("Tutup sesi tanpa pembayaran")}</Button>}{table.session && !table.orders.length && <Button className="secondary-button danger-text" onClick={() => setClosing("EMPTY")}>{t("Tutup sesi kosong")}</Button>}</div>
      </Panel>
      {showManual && <Panel className="admin-panel"><h2>{t("Order manual")}</h2><p className="muted">{t("Order baru masuk status Menunggu dan perlu dikonfirmasi.")}</p>
        <form onSubmit={(event) => void submitManual(event)}>
          {draft.uncertain && <Alert className="inline-alert info">{t("Pengiriman pesanan sebelumnya belum pasti. Coba lagi sebelum mengubah pesanan.")}</Alert>}
          <fieldset className="order-draft" disabled={busy === "manual" || draft.uncertain}>
          <div className="admin-form-grid"><label>{t("Nama pelanggan / label")}<Input className="text-field" required maxLength={120} value={draft.customerName} onChange={(event) => editDraft({ customerName: event.target.value })} /></label><label>{t("Catatan order (opsional)")}<Input className="text-field" maxLength={500} value={draft.note} onChange={(event) => editDraft({ note: event.target.value })} /></label></div>
          <label className="field-label">{t("Cari menu")}<Input className="text-field" value={search} onChange={(event) => { setSearch(event.target.value); setMenuPage(1); }} placeholder={t("Nama menu")} /></label>
          {!menu ? menuError ? <Alert>{t(menuError)} <Button type="button" className="text-button" onClick={() => void loadMenu()}>{t("Coba lagi")}</Button></Alert> : <LoadingState variant="menu">{t("Memuat menu…")}</LoadingState> : menu.categories.map((category) => {
            const listed = category.items.filter((item) => visibleMenuIds.has(item.id));
            return listed.length ? <div key={category.id} className="pos-menu-group"><h3>{category.name}</h3><div className="menu-grid">{listed.map((item) => {
              const selected = draft.cart.find((entry) => entry.id === item.id);
              const cartItem: CartItem = { id: item.id, name: item.name, priceIdr: item.priceIdr, quantity: selected?.quantity ?? 0, note: selected?.note ?? "" };
              return <MenuCard key={item.id} menu={item} className="pos-menu-card"><div className="stepper"><Button type="button" aria-label={t("Kurangi {0}", { "0": item.name })} disabled={!selected} onClick={() => editDraft({ cart: changeCart(draft.cart, cartItem, cartItem.quantity - 1) })}>−</Button><span>{cartItem.quantity}</span><Button type="button" aria-label={t("Tambah {0}", { "0": item.name })} disabled={cartItem.quantity >= 99} onClick={() => editDraft({ cart: changeCart(draft.cart, cartItem, cartItem.quantity + 1) })}>+</Button></div></MenuCard>;
            })}</div></div> : null;
          })}
          {menu && <Pagination pageSize={menuPageSize} onPageSizeChange={setMenuPageSize} page={currentMenuPage} hasNext={currentMenuPage * menuPageSize < filteredMenuItems.length} total={filteredMenuItems.length} onChange={setMenuPage} />}
          {draft.cart.length > 0 && <div className="summary-card"><h3>{t("Ringkasan order")}</h3>{draft.cart.map((item) => <div className="cart-row" key={item.id}><div className="cart-row-head"><strong>{item.quantity}× {item.name}</strong><span>{money(BigInt(item.priceIdr) * BigInt(item.quantity))}</span></div><Input className="text-field cart-note" aria-label={t("Catatan {0}", { "0": item.name })} maxLength={500} placeholder={t("Catatan item (opsional)")} value={item.note} onChange={(event) => editDraft({ cart: draft.cart.map((entry) => entry.id === item.id ? { ...entry, note: event.target.value } : entry) })} /></div>)}<div className="money-row"><strong>{t("Subtotal menu")}</strong><strong>{money(cartSubtotal(draft.cart))}</strong></div></div>}
          </fieldset>
          <div className="admin-actions"><Button className="primary-button" disabled={busy === "manual" || !draft.cart.length || !menu}>{busy === "manual" ? t("Menyimpan…") : draft.uncertain ? t("Coba Lagi dengan Aman") : t("Simpan order Menunggu")}</Button></div>
        </form>
      </Panel>}
      <DetailPane footer={table.session && receiptSessionId === table.session.id ? undefined : <PosTableActions sessionId={table.session?.id} reserved={table.status === "RESERVED"} busy={Boolean(busy)} paymentDisabled={Boolean(draft.uncertain)} addLabel={showManual ? "Tutup form order" : "Tambah order manual"} onAddOrder={() => setShowManual((current) => !current)} onReceipt={() => setReceiptSessionId(table.session?.id ?? "")} onPayment={onPayment} />}>{table.session && receiptSessionId === table.session.id ? <ReceiptPreview key={table.session.id} sessionId={table.session.id} onClose={() => setReceiptSessionId("")} /> : <><OrderDetails orders={table.orders} busy={busy}
        onConfirm={(id) => void mutate(`/api/staff/orders/${id}/confirm`, jsonRequest("POST", {}), `confirm:${id}`)}
        onServe={(id) => void mutate(`/api/staff/order-items/${id}/served`, jsonRequest("PATCH", { served: true }), `served:${id}`)}
        onVoid={setVoidItem}
      />{table.session && <PosBillPreview key={table.session.id} sessionId={table.session.id} />}</>}</DetailPane>
      {voidItem && <OrderItemDeletion key={voidItem.id} item={voidItem} onClose={() => setVoidItem(null)} onDeleted={async () => { await refresh(); setNotice({ text: "{0} dihapus dari pesanan. Tagihan diperbarui.", values: { 0: voidItem.menuName } }); }} />}
      {closing && table.session && <ConfirmationDialog titleId="close-title" onClose={() => setClosing(null)}><h2 id="close-title">{t("Tutup sesi tanpa pembayaran?")}</h2><p>{closing === "EMPTY" ? t("Sesi belum berisi pesanan.") : t("Semua item dibatalkan.")} {" "}{t("Meja akan kembali tersedia tanpa membuat pembayaran.")}</p>{error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}<form onSubmit={(event) => void closeSession(event)}><label className="field-label">{t("Alasan penutupan")}<Textarea className="text-field" minLength={5} maxLength={500} required value={closeReason} onChange={(event) => setCloseReason(event.target.value)} /></label><div className="admin-actions"><Button type="button" className="secondary-button" onClick={() => setClosing(null)}>{t("Kembali")}</Button><Button className="primary-button" disabled={Boolean(busy)}>{t("Tutup sesi")}</Button></div></form></ConfirmationDialog>}
    </>}
  </div>;
}
