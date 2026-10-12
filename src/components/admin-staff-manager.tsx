"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { adminApi, AdminApiError, jsonRequest } from "@/lib/admin/client";

type Staff = { userId: string; displayName: string; role: "ADMIN" | "CASHIER"; isActive: boolean };

export function StaffManager() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try { setStaff(await adminApi<Staff[]>(`/api/admin/staff?page=${page}&pageSize=20`)); setError(""); }
    catch { setError("Daftar staf belum dapat dimuat. Coba lagi."); }
    finally { setLoading(false); }
  }, [page]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await adminApi(editing === "new" ? "/api/admin/staff" : `/api/admin/staff/${editing.userId}`,
        jsonRequest(editing === "new" ? "POST" : "PATCH", editing === "new" ? { email: email.trim(), displayName: name.trim(), role: "CASHIER" } : { displayName: name.trim() }));
      await load(); setNotice(editing === "new" ? "Akun Kasir dibuat. Email pengaturan kata sandi telah dikirim." : "Nama staf diperbarui."); setEditing(null);
    } catch (cause) { setError(cause instanceof AdminApiError && cause.code === "AUTH_CLEANUP_FAILED" ? "Pembuatan akun gagal dan perlu diperiksa oleh administrator Auth sebelum mencoba lagi." : "Akun belum dapat disimpan. Periksa email dan layanan pengaturan kata sandi."); }
    finally { setBusy(false); }
  }
  async function toggle(item: Staff) {
    if (!window.confirm(`${item.isActive ? "Nonaktifkan" : "Aktifkan"} akses ${item.displayName}?`)) return;
    setBusy(true); setError(""); setNotice("");
    try { await adminApi(`/api/admin/staff/${item.userId}`, jsonRequest("PATCH", { isActive: !item.isActive })); await load(); setNotice("Akses staf diperbarui."); }
    catch (cause) { setError(cause instanceof AdminApiError && cause.code === "LAST_ADMIN" ? "Admin aktif terakhir tidak dapat dinonaktifkan." : "Akses staf belum dapat diperbarui. Coba lagi."); }
    finally { setBusy(false); }
  }
  return <div className="admin-stack"><section className="admin-panel">
    <div className="admin-section-head"><h2>Akun staf</h2><button className="primary-button" disabled={busy} onClick={() => { setEditing("new"); setName(""); setEmail(""); setError(""); }}>Tambah Kasir</button></div>
    <p className="muted">Kasir menerima email untuk mengatur kata sandi. Nonaktifkan akses untuk menghentikan semua aksi privat akun tersebut.</p>
    {error && <div className="inline-alert" role="alert">{error}</div>}{notice && <div className="inline-alert info" role="status">{notice}</div>}
    {editing && <form className="admin-form" onSubmit={save}><h3>{editing === "new" ? "Kasir baru" : "Ubah nama staf"}</h3><div className="admin-form-grid"><label>Nama staf<input className="text-field" required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label>{editing === "new" && <label>Email<input className="text-field" type="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>}</div><div className="admin-actions"><button className="primary-button" disabled={busy}>{busy ? "Menyimpan…" : "Simpan staf"}</button><button type="button" className="secondary-button" disabled={busy} onClick={() => setEditing(null)}>Batal</button></div></form>}
    {loading ? <p className="loading-block" role="status">Memuat staf…</p> : staff.length ? <div className="admin-list">{staff.map((item) => <div className="admin-list-row" key={item.userId}><div className="admin-list-main"><strong>{item.displayName}</strong><p>{item.role === "ADMIN" ? "Admin" : "Kasir"} · {item.isActive ? "Aktif" : "Nonaktif"}</p></div><div className="admin-row-actions"><button className="text-button" disabled={busy} onClick={() => { setEditing(item); setName(item.displayName); setError(""); }}>Ubah nama</button><button className={`text-button ${item.isActive ? "danger-text" : ""}`} disabled={busy} onClick={() => void toggle(item)}>{item.isActive ? "Nonaktifkan" : "Aktifkan"}</button></div></div>)}</div> : <p className="empty-state">Tidak ada staf pada halaman ini.</p>}
    <div className="pagination"><span>Halaman {page}</span><div><button className="secondary-button" disabled={page === 1 || busy} onClick={() => setPage(page - 1)}>Sebelumnya</button><button className="secondary-button" disabled={staff.length < 20 || busy} onClick={() => setPage(page + 1)}>Berikutnya</button><button className="secondary-button" onClick={() => void load()}>Segarkan</button></div></div>
  </section></div>;
}
