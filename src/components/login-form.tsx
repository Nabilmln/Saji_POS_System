"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";
import { adminApi } from "@/lib/admin/client";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const result = await authClient.signIn.email({ email: email.trim(), password });
      if (result.error) { setError("Email atau kata sandi tidak sesuai."); return; }
      const staff = await adminApi<{ role: "ADMIN" | "CASHIER" }>("/api/staff/me");
      router.replace(staff.role === "ADMIN" ? "/admin/menus" : "/pos");
      router.refresh();
    } catch { setError("Tidak dapat masuk. Periksa koneksi dan coba lagi."); }
    finally { setBusy(false); }
  }

  return <main className="entry-page login-page">
    <div className="brand-mark" aria-hidden="true">S</div>
    <p className="eyebrow">AKSES STAF</p>
    <h1>Selamat datang kembali.</h1>
    <p className="muted">Masuk untuk mengelola restoran.</p>
    <form onSubmit={submit} className="login-form">
      <label className="field-label" htmlFor="staff-email">Email</label>
      <input className="text-field" id="staff-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
      <label className="field-label" htmlFor="staff-password">Kata sandi</label>
      <input className="text-field" id="staff-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} />
      {error && <div className="inline-alert" role="alert">{error}</div>}
      <button className="primary-button full-width" disabled={busy}>{busy ? "Memeriksa akun…" : "Masuk"}</button>
    </form>
  </main>;
}
