"use client";

import { Text, useLocale } from "@/components/locale-provider";
import { useNotice, statusNotice } from "@/components/ui/notice";
import { usePolling } from "@/lib/use-polling";
import { useCallback, useState, type FormEvent } from "react";
import Link from "next/link";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";
import { Alert, Button, LoadingState, EmptyState, Panel, Textarea } from "@/components/ui/controls";
import { DetailPane, HeaderAction } from "@/components/app-shells";
import { SyncStatus } from "@/components/ui/sync-status";
import { OrderDetails, type OrderItem as Item, type StaffOrder as Order } from "@/components/order-details";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { PosBillPreview } from "@/components/pos-bill";
import { PosTableActions } from "@/components/pos-table-actions";
import { ReceiptPreview } from "@/components/pos-receipt";
import { OrderItemDeletion } from "@/components/order-item-deletion";
import { PosManualOrderModal } from "@/components/pos-manual-order-modal";

export type StaffTable = { id: string; tableNumber: string; status: "AVAILABLE" | "OCCUPIED" | "RESERVED"; session: { id: string; billRevision: string } | null; orders: Order[]; bill: { subtotalIdr: string; grandTotalIdr: string } | null };

export function PosTable({ tableId, onClose, onPayment, initialManual = false }: { tableId: string; onClose?: () => void; onPayment?: (sessionId: string) => void; initialManual?: boolean }) {
  const { t } = useLocale();
  const [table, setTable] = useState<StaffTable | null>(null);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [syncFailed, setSyncFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const setNotice = useNotice();
  const [busy, setBusy] = useState("");
  const [voidItem, setVoidItem] = useState<Item | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [closing, setClosing] = useState<"EMPTY" | "ALL_VOID" | null>(null);
  const [showManual, setShowManual] = useState(initialManual);
  const [receiptSessionId, setReceiptSessionId] = useState("");

  const refresh = useCallback(async () => {
    try { setTable(await adminApi<StaffTable>(`/api/staff/tables/${tableId}`)); setError(""); setSyncedAt(new Date()); setSyncFailed(false); }
    catch { setError("Data meja belum tersinkron. Periksa koneksi lalu segarkan."); setSyncFailed(true); }
    finally { setReady(true); }
  }, [tableId]);
  usePolling(refresh);

  async function mutate(path: string, init: RequestInit, action: string) {
    setBusy(action); setError(""); setNotice("");
    try {
      await adminApi(path, init); await refresh();
      if (action !== "close") {
        const id = action.split(":")[1];
        const item = table?.orders.flatMap((order) => order.items).find((entry) => entry.id === id);
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
    <HeaderAction>
      <SyncStatus syncedAt={syncedAt} syncFailed={syncFailed} />
      <Button className="secondary-button header-action-button" onClick={() => void refresh()}>{t("Segarkan")}</Button>
    </HeaderAction>
    {onClose ? <Button className="text-button" disabled={!!busy} onClick={onClose}>{t("← Semua meja")}</Button> : <Link className="text-button" href="/pos">{t("← Semua meja")}</Link>}
    {error && <Alert className="inline-alert" role="alert">{t(error)} <Button className="text-button" onClick={() => void refresh()}>{t("Segarkan")}</Button></Alert>}

    {!ready ? <LoadingState className="loading-block" role="status">{t("Memuat detail meja…")}</LoadingState> : !table ? <EmptyState className="empty-state">{t("Meja tidak ditemukan.")}{" "}<Button className="text-button" onClick={() => void refresh()}>{t("Coba lagi")}</Button></EmptyState> : <>
      <Panel className="admin-panel">
        <div className="admin-section-head"><div><h2>{t("Meja")}{" "}{table.tableNumber}</h2></div></div>
        <p className="muted">{table.status === "AVAILABLE" ? t("Tersedia") : table.status === "RESERVED" ? t("Dipesan · check-in diperlukan sebelum order manual") : t("Terisi")}{table.session ? t(" · Sesi {0}", { "0": table.session.id.slice(0, 8) }) : ""}</p>
        <div className="admin-actions">{allVoid && <Button className="secondary-button danger-text" onClick={() => setClosing("ALL_VOID")}>{t("Tutup sesi tanpa pembayaran")}</Button>}{table.session && !table.orders.length && <Button className="secondary-button danger-text" onClick={() => setClosing("EMPTY")}>{t("Tutup sesi kosong")}</Button>}</div>
      </Panel>
      <DetailPane revision={JSON.stringify([table, receiptSessionId])} footer={table.session && receiptSessionId === table.session.id ? undefined : <PosTableActions sessionId={table.session?.id} reserved={table.status === "RESERVED"} busy={Boolean(busy)} addLabel="Tambah order manual" onAddOrder={() => setShowManual(true)} onReceipt={() => setReceiptSessionId(table.session?.id ?? "")} onPayment={onPayment} />}>{table.session && receiptSessionId === table.session.id ? <ReceiptPreview key={table.session.id} sessionId={table.session.id} onClose={() => setReceiptSessionId("")} /> : <><OrderDetails orders={table.orders} busy={busy}
        onConfirm={(id) => void mutate(`/api/staff/orders/${id}/confirm`, jsonRequest("POST", {}), `confirm:${id}`)}
        onServe={(id) => void mutate(`/api/staff/order-items/${id}/served`, jsonRequest("PATCH", { served: true }), `served:${id}`)}
        onVoid={setVoidItem}
      />{table.session && <PosBillPreview key={table.session.id} sessionId={table.session.id} />}</>}</DetailPane>
      {showManual && (
        <PosManualOrderModal
          tableId={table.id}
          tableNumber={table.tableNumber}
          tableOccupied={table.status === "OCCUPIED" || Boolean(table.session)}
          onClose={() => setShowManual(false)}
          onSuccess={async () => {
            setShowManual(false);
            await refresh();
            setNotice({
              text: "Pesanan tersimpan sebagai {0}. Konfirmasikan saat siap diproses.",
              values: { 0: <Text value="Menunggu" /> },
              subject: <Text value={`Meja ${table.tableNumber}`} />,
            });
          }}
        />
      )}
      {voidItem && <OrderItemDeletion key={voidItem.id} item={voidItem} onClose={() => setVoidItem(null)} onDeleted={async () => { await refresh(); setNotice({ text: "{0} dihapus dari pesanan. Tagihan diperbarui.", values: { 0: voidItem.menuName } }); }} />}
      {closing && table.session && <ConfirmationDialog titleId="close-title" onClose={() => setClosing(null)}><h2 id="close-title">{t("Tutup sesi tanpa pembayaran?")}</h2><p>{closing === "EMPTY" ? t("Sesi belum berisi pesanan.") : t("Semua item dibatalkan.")} {" "}{t("Meja akan kembali tersedia tanpa membuat pembayaran.")}</p>{error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}<form onSubmit={(event) => void closeSession(event)}><label className="field-label">{t("Alasan penutupan")}<Textarea className="text-field" minLength={5} maxLength={500} required value={closeReason} onChange={(event) => setCloseReason(event.target.value)} /></label><div className="admin-actions"><Button type="button" className="secondary-button" onClick={() => setClosing(null)}>{t("Kembali")}</Button><Button className="primary-button" disabled={Boolean(busy)}>{t("Tutup sesi")}</Button></div></form></ConfirmationDialog>}
    </>}
  </div>;
}
