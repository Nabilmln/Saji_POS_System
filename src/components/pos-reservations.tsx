"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 5000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, [load]);
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
  return <div className="admin-stack"><section className="admin-panel"><div className="admin-section-head"><h2>Reservasi manual</h2><button className="primary-button" disabled={busy} onClick={() => setCreating(!creating)}>{creating ? "Tutup form" : "Tambah reservasi"}</button></div><p className="muted">Catat pesanan meja dari telepon atau WhatsApp. Waktu menggunakan WIB; meja diblokir segera setelah reservasi dibuat.</p>
    {error && <div className="inline-alert" role="alert">{error}</div>}{notice && <div className="inline-alert info" role="status">{notice}</div>}
    {creating && <form className="admin-form" onSubmit={create}><div className="admin-form-grid"><label>Nama pelanggan<input className="text-field" name="name" required maxLength={120} /></label><label>Kontak pelanggan<input className="text-field" name="contact" required maxLength={80} /></label><label>Meja tersedia<select className="text-field" name="tableId" required defaultValue=""><option value="" disabled>Pilih meja</option>{tables.map((table) => <option key={table.id} value={table.id}>Meja {table.tableNumber}</option>)}</select></label><label>Jumlah tamu<input className="text-field" name="guests" type="number" required min={1} max={100} defaultValue={2} /></label><label>Waktu reservasi (WIB)<input className="text-field" name="time" type="datetime-local" required /></label><label>Catatan<textarea className="text-field" name="notes" maxLength={2000} /></label></div><div className="admin-actions"><button className="primary-button" disabled={busy || !tables.length}>{busy ? "Menyimpan…" : "Simpan reservasi"}</button></div>{!tables.length && <p className="muted">Tidak ada meja tersedia.</p>}</form>}
    <div className="admin-section-head"><label>Status<select className="text-field" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Semua</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><button className="secondary-button" onClick={() => void load()}>Segarkan</button></div>
    {!loaded ? <p className="loading-block" role="status">Memuat reservasi…</p> : rows.length ? <div className="admin-list">{rows.map((item) => <div className="reservation-row" key={item.id}><div className="admin-list-row"><div className="admin-list-main"><strong>Meja {item.tableNumber} · {item.customerName}</strong><p>{item.guestCount} tamu · {new Date(item.reservedFor).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB · {labels[item.status]}</p>{item.notes && <p>{item.notes}</p>}<details><summary>Lihat kontak</summary><span>{item.customerContact}</span></details></div><div className="admin-row-actions">{item.status === "RESERVED" ? <><button className="primary-button" disabled={busy} onClick={() => void checkIn(item)}>Check-in</button><button className="text-button danger-text" disabled={busy} onClick={() => { setCancelId(item.id); setReason(""); }}>Batalkan reservasi</button></> : item.status === "CHECKED_IN" && <Link className="secondary-button" href={`/pos/tables/${item.tableId}`}>Lihat meja</Link>}</div></div>{cancelId === item.id && <form className="admin-form" onSubmit={cancel}><label>Alasan pembatalan<textarea className="text-field" required minLength={5} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label><div className="admin-actions"><button className="primary-button" disabled={busy}>Konfirmasi pembatalan</button><button type="button" className="secondary-button" onClick={() => setCancelId("")}>Kembali</button></div></form>}</div>)}</div> : <p className="empty-state">Tidak ada reservasi pada status ini.</p>}
    <div className="pagination"><span>Halaman {page}</span><div><button className="secondary-button" disabled={page === 1} onClick={() => setPage(page - 1)}>Sebelumnya</button><button className="secondary-button" disabled={rows.length < 20} onClick={() => setPage(page + 1)}>Berikutnya</button></div></div>
  </section></div>;
}
