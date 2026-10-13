"use client";

import { useLocale } from "@/components/locale-provider";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { PasswordInput, Alert, Button } from "@/components/ui/controls";
import { EntryHeader } from "@/components/ui/entry-header";
import { authClient } from "@/lib/auth/client";

export function PasswordResetForm({ token, role = "CASHIER" }: { token?: string; role?: "ADMIN" | "CASHIER" }) {
  const { t } = useLocale();
  const loginPath = role === "ADMIN" ? "/owner-login" : "/login";
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
  return <main className="entry-page"><EntryHeader /><h1>{t("Atur kata sandi")}</h1>{done ? <><p role="status">{t("Kata sandi tersimpan. Silakan masuk dengan akun staf Anda.")}</p><Link className="primary-button" href={loginPath}>{t(role === "ADMIN" ? "Masuk Pemilik" : "Masuk Kasir")}</Link></> : !token ? <><p>{t("Tautan pengaturan kata sandi tidak lengkap.")}</p><Link className="primary-button" href={loginPath}>{t("Minta tautan baru")}</Link></> : <form className="login-form" onSubmit={submit}><label className="field-label">{t("Kata sandi baru")}<PasswordInput autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} /></label><label className="field-label">{t("Konfirmasi kata sandi")}<PasswordInput autoComplete="new-password" minLength={8} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>{error && <Alert className="inline-alert" role="alert">{t(error)}</Alert>}<Button className="primary-button full-width" disabled={busy}>{busy ? t("Menyimpan…") : t("Simpan kata sandi")}</Button></form>}</main>;
}
