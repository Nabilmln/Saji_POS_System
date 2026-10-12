"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";

export function PasswordResetForm({ token }: { token?: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!token) return;
    if (password !== confirmation) { setError("Konfirmasi kata sandi tidak cocok."); return; }
    setBusy(true); setError("");
    try { const result = await authClient.resetPassword({ newPassword: password, token }); if (result.error) throw result.error; setDone(true); }
    catch { setError("Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru melalui halaman masuk."); }
    finally { setBusy(false); }
  }
  return <main className="entry-page"><h1>Atur kata sandi</h1>{done ? <><p role="status">Kata sandi tersimpan. Silakan masuk dengan akun staf Anda.</p><Link className="primary-button" href="/login">Masuk Staf</Link></> : !token ? <><p>Tautan pengaturan kata sandi tidak lengkap.</p><Link className="primary-button" href="/login">Minta tautan baru</Link></> : <form className="login-form" onSubmit={submit}><label className="field-label">Kata sandi baru<input className="text-field" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><label className="field-label">Konfirmasi kata sandi<input className="text-field" type="password" autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{error && <div className="inline-alert" role="alert">{error}</div>}<button className="primary-button full-width" disabled={busy}>{busy ? "Menyimpan…" : "Simpan kata sandi"}</button></form>}</main>;
}
