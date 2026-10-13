"use client";

import { useLocale } from "@/components/locale-provider";
import { formatDateTime } from "@/lib/time";

import { usePolling } from "@/lib/use-polling";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Selection, Pagination, Panel, Button, Alert, Input, Textarea } from "@/components/ui/controls";
import { DataTable } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { usePagination } from "@/lib/use-pagination";
import { adminPage, adminApi, jsonRequest } from "@/lib/admin/client";

type Reservation = { id: string; tableId: string; tableNumber: string; customerName: string; customerContact: string; guestCount: number; reservedFor: string; notes: string | null; status: "RESERVED" | "CHECKED_IN" | "CANCELLED" };
type Table = { id: string; tableNumber: string; status: string };

export function PosReservations() {
  const { t, locale } = useLocale();
  const labels = { RESERVED: t("Direservasi"), CHECKED_IN: t("Sudah check-in"), CANCELLED: locale === "en" ? "Cancelled" : "Dibatalkan" };
  const router = useRouter();
  const [hasNext, setHasNext] = useState(false);
  const [rows, setRows] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [status, setStatus] = useState("RESERVED");
  const { page, setPage, pageSize, setPageSize } = usePagination();
  const [creating, setCreating] = useState(false);
  const [cancelId, setCancelId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) }); if (status) query.set("status", status);
    try { const [reservations, available] = await Promise.all([adminPage<Reservation>(`/api/staff/reservations?${query}`), adminApi<Table[]>("/api/staff/tables?status=AVAILABLE")]); setRows(reservations.items); setHasNext(reservations.hasNext); setTables(available); setError(""); }
    catch { setError("Reservasi belum dapat dimuat. Periksa koneksi lalu segarkan."); }
    finally { setLoaded(true); }
  }, [status, page, pageSize]);
  usePolling(load);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi("/api/staff/reservations", jsonRequest("POST", { tableId: data.get("tableId"), customerName: String(data.get("name")).trim(), customerContact: String(data.get("contact")).trim(), guestCount: Number(data.get("guests")), reservedFor: `${data.get("time")}:00+07:00`, notes: String(data.get("notes")).trim() }));
      await load(); setCreating(false); setNotice("Reservasi tersimpan. Meja diblokir sampai check-in atau pembatalan.");
    } catch { setError("Reservasi gagal disimpan. Meja mungkin sudah terisi; segarkan pilihan meja dan coba lagi."); }
    finally { setBusy(false); }
  }
  async function checkIn(item: Reservation) {
    if (!window.confirm(t("Check-in {0} ke Meja {1}?", { "0": item.customerName, "1": item.tableNumber }))) return;
    setBusy(true); setError("");
    try { await adminApi(`/api/staff/reservations/${item.id}/check-in`, jsonRequest("POST", {})); router.push(`/pos/tables/${item.tableId}`); }
    catch { setError("Check-in belum berhasil. Segarkan untuk melihat status terbaru."); }
    finally { setBusy(false); }
  }
  async function cancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try { await adminApi(`/api/staff/reservations/${cancelId}/cancel`, jsonRequest("POST", { reason: reason.trim() })); await load(); setCancelId(""); setReason(""); setNotice("Reservasi dibatalkan. Meja kembali tersedia."); }
    catch { setError("Reservasi belum dapat dibatalkan. Periksa status terbaru dan coba lagi."); }
    finally { setBusy(false); }
  }
  return <div className="admin-stack"><Panel className="admin-panel"><div className="admin-section-head"><h2>{t("Reservasi manual")}</h2><Button className="primary-button" disabled={busy} onClick={() => setCreating(!creating)}>{creating ? t("Tutup form") : t("Tambah reservasi")}</Button></div><p className="muted">{t("Catat pesanan meja dari telepon atau WhatsApp. Waktu menggunakan WIB; meja diblokir segera setelah reservasi dibuat.")}</p>
    {error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}{notice && <Alert toast className="inline-alert info" role="status">{t(notice)}</Alert>}
    {creating && <form className="admin-form" onSubmit={create}><div className="admin-form-grid"><label>{t("Nama pelanggan")}<Input className="text-field" name="name" required maxLength={120} /></label><label>{t("Kontak pelanggan")}<Input className="text-field" name="contact" required maxLength={80} /></label><Selection label={t("Meja tersedia")} kind="dropdown" name="tableId" required options={[{ value: "", label: t("Pilih meja"), disabled: true }, ...tables.map((table) => ({ value: table.id, label: t("Meja {0}", { "0": table.tableNumber }) }))]} /><label>{t("Jumlah tamu")}<Input className="text-field" name="guests" type="number" required min={1} max={100} defaultValue={2} /></label><label>{t("Waktu reservasi (WIB)")}<Input className="text-field" name="time" type="datetime-local" required /></label><label>{t("Catatan")}<Textarea className="text-field" name="notes" maxLength={2000} /></label></div><div className="admin-actions"><Button className="primary-button" disabled={busy || !tables.length}>{busy ? t("Menyimpan…") : t("Simpan reservasi")}</Button></div>{!tables.length && <p className="muted">{t("Tidak ada meja tersedia.")}</p>}</form>}
  </Panel><Panel><div className="admin-section-head"><h2>{t("Daftar reservasi")}</h2></div>
    <div className="admin-section-head"><Selection label={t("Status reservasi")} value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[{ value: "", label: t("Semua") }, ...Object.entries(labels).map(([value, label]) => ({ value, label: t(label) }))]} /><Button className="secondary-button" onClick={() => void load()}>{t("Segarkan")}</Button></div>
    {cancelId && rows.some((row) => row.id === cancelId && row.status === "RESERVED") && <form className="admin-form" onSubmit={cancel}><h3>{t("Batalkan reservasi")}: {rows.find((row) => row.id === cancelId)?.customerName}</h3><label>{t("Alasan pembatalan")}<Textarea required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="admin-actions"><Button disabled={busy}>{t("Konfirmasi pembatalan")}</Button><Button type="button" className="secondary-button" onClick={() => setCancelId("")}>{t("Kembali")}</Button></div></form>}
    {!loaded ? <p className="loading-block" role="status">{t("Memuat reservasi\u2026")}</p> : rows.length ? <DataTable caption={t("Daftar reservasi")} columns={[t("Pelanggan"), t("Meja"), t("Tamu"), t("Waktu reservasi (WIB)"), t("Status"), t("Tindakan")]}>{rows.map((item) => <tr key={item.id}>
      <th scope="row">{item.customerName}<details><summary>{t("Lihat kontak")}</summary><span>{item.customerContact}</span>{item.notes && <p>{item.notes}</p>}</details></th><td>{item.tableNumber}</td><td>{item.guestCount}</td><td className="date-cell">{formatDateTime(item.reservedFor, locale)}</td><td><StatusBadge status={item.status}>{labels[item.status]}</StatusBadge></td>
      <td><div className="admin-row-actions">{item.status === "RESERVED" ? <><Button disabled={busy} onClick={() => void checkIn(item)}>{t("Check-in")}</Button><Button className="text-button danger-text" disabled={busy} onClick={() => { setCancelId(item.id); setReason(""); }}>{t("Batalkan reservasi")}</Button></> : item.status === "CHECKED_IN" && <Link className="secondary-button" href={`/pos/tables/${item.tableId}`}>{t("Lihat meja")}</Link>}</div></td>
    </tr>)}</DataTable> : <p className="empty-state">{t("Tidak ada reservasi pada status ini.")}</p>}
  </Panel><Pagination pageSize={pageSize} onPageSizeChange={setPageSize} page={page} hasNext={hasNext} onChange={setPage} disabled={busy} /></div>;
}
