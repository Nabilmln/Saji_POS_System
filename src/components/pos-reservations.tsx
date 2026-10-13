"use client";

import { usePolling } from "@/lib/use-polling";

import { useCallback, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Selection, Pagination, Panel, Button, Alert, Input, Textarea } from "@/components/ui/controls";
import { adminApi, jsonRequest } from "@/lib/admin/client";

type Reservation = { id: string; tableId: string; tableNumber: string; customerName: string; customerContact: string; guestCount: number; reservedFor: string; notes: string | null; status: "RESERVED" | "CHECKED_IN" | "CANCELLED" };
type Table = { id: string; tableNumber: string; status: string };
const labels = { RESERVED: "Direservasi", CHECKED_IN: "Sudah check-in", CANCELLED: "Dibatalkan" };

export function PosReservations() {
  const router = useRouter();
  const [rows, setRows] = useState<Reservation[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [status, setStatus] = useState("RESERVED");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [cancelId, setCancelId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const query = new URLSearchParams({ page: String(page), pageSize: "20" }); if (status) query.set("status", status);
    try { const [reservations, available] = await Promise.all([adminApi<Reservation[]>(`/api/staff/reservations?${query}`), adminApi<Table[]>("/api/staff/tables?status=AVAILABLE")]); setRows(reservations); setTables(available); setError(""); }
    catch { setError("Reservasi belum dapat dimuat. Periksa koneksi lalu segarkan."); }
    finally { setLoaded(true); }
  }, [status, page]);
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
    if (!window.confirm(`Check-in ${item.customerName} ke Meja ${item.tableNumber}?`)) return;
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
  return <div className="admin-stack"><Panel className="admin-panel"><div className="admin-section-head"><h2>Reservasi manual</h2><Button className="primary-button" disabled={busy} onClick={() => setCreating(!creating)}>{creating ? "Tutup form" : "Tambah reservasi"}</Button></div><p className="muted">Catat pesanan meja dari telepon atau WhatsApp. Waktu menggunakan WIB; meja diblokir segera setelah reservasi dibuat.</p>
    {error && <Alert className="inline-alert" role="alert">{error}</Alert>}{notice && <Alert className="inline-alert info" role="status">{notice}</Alert>}
    {creating && <form className="admin-form" onSubmit={create}><div className="admin-form-grid"><label>Nama pelanggan<Input className="text-field" name="name" required maxLength={120} /></label><label>Kontak pelanggan<Input className="text-field" name="contact" required maxLength={80} /></label><Selection label="Meja tersedia" kind="dropdown" name="tableId" required options={[{ value: "", label: "Pilih meja", disabled: true }, ...tables.map((table) => ({ value: table.id, label: `Meja ${table.tableNumber}` }))]} /><label>Jumlah tamu<Input className="text-field" name="guests" type="number" required min={1} max={100} defaultValue={2} /></label><label>Waktu reservasi (WIB)<Input className="text-field" name="time" type="datetime-local" required /></label><label>Catatan<Textarea className="text-field" name="notes" maxLength={2000} /></label></div><div className="admin-actions"><Button className="primary-button" disabled={busy || !tables.length}>{busy ? "Menyimpan…" : "Simpan reservasi"}</Button></div>{!tables.length && <p className="muted">Tidak ada meja tersedia.</p>}</form>}
    <div className="admin-section-head"><Selection label="Status reservasi" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={[{ value: "", label: "Semua" }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))]} /><Button className="secondary-button" onClick={() => void load()}>Segarkan</Button></div>
    {!loaded ? <p className="loading-block" role="status">Memuat reservasi…</p> : rows.length ? <div className="admin-list">{rows.map((item) => <div className="reservation-row" key={item.id}><div className="admin-list-row"><div className="admin-list-main"><strong>Meja {item.tableNumber} · {item.customerName}</strong><p>{item.guestCount} tamu · {new Date(item.reservedFor).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB · {labels[item.status]}</p>{item.notes && <p>{item.notes}</p>}<details><summary>Lihat kontak</summary><span>{item.customerContact}</span></details></div><div className="admin-row-actions">{item.status === "RESERVED" ? <><Button className="primary-button" disabled={busy} onClick={() => void checkIn(item)}>Check-in</Button><Button className="text-button danger-text" disabled={busy} onClick={() => { setCancelId(item.id); setReason(""); }}>Batalkan reservasi</Button></> : item.status === "CHECKED_IN" && <Link className="secondary-button" href={`/pos/tables/${item.tableId}`}>Lihat meja</Link>}</div></div>{cancelId === item.id && <form className="admin-form" onSubmit={cancel}><label>Alasan pembatalan<Textarea className="text-field" required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="admin-actions"><Button className="primary-button" disabled={busy}>Konfirmasi pembatalan</Button><Button type="button" className="secondary-button" onClick={() => setCancelId("")}>Kembali</Button></div></form>}</div>)}</div> : <p className="empty-state">Tidak ada reservasi pada status ini.</p>}
    <Pagination page={page} hasNext={rows.length === 20} onChange={setPage} />
  </Panel></div>;
}
