"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { StaffShell } from "@/components/app-shells";
import { adminApi, AdminApiError } from "@/lib/admin/client";
import { authClient } from "@/lib/auth/client";

export function PosFrame({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [name, setName] = useState("");
  const [state, setState] = useState<"loading" | "ready" | "login" | "error">("loading");
  const [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    let active = true;
    adminApi<{ displayName: string }>("/api/staff/me")
      .then((user) => { if (active) { setName(user.displayName); setState("ready"); } })
      .catch((error: unknown) => { if (active) setState(error instanceof AdminApiError && error.status === 401 ? "login" : "error"); });
    return () => { active = false; };
  }, []);

  if (state !== "ready") return <main className="entry-page">
    <div className="brand-mark" aria-hidden="true">S</div>
    <p className="eyebrow">AREA KASIR</p>
    <h1>{state === "loading" ? "Memeriksa akses…" : state === "login" ? "Masuk diperlukan" : "Tidak dapat memuat halaman"}</h1>
    <p>{state === "login" ? "Silakan masuk dengan akun staf." : state === "error" ? "Periksa koneksi, lalu coba lagi." : ""}</p>
    {state === "error" ? <button className="primary-button" onClick={() => window.location.reload()}>Coba Lagi</button> : state === "login" ? <Link className="primary-button" href="/login">Masuk Staf</Link> : null}
  </main>;

  const navigation = <>
    <Link className={`staff-nav-item ${pathname.startsWith("/pos/transactions") ? "" : "active"}`} href="/pos" aria-current={pathname.startsWith("/pos/transactions") ? undefined : "page"}>Meja & Pesanan</Link>
    <Link className={`staff-nav-item ${pathname.startsWith("/pos/transactions") ? "active" : ""}`} href="/pos/transactions" aria-current={pathname.startsWith("/pos/transactions") ? "page" : undefined}>Riwayat Transaksi</Link>
    <p className="staff-nav-label">AKUN</p>
    <p className="staff-account">{name}</p>
    <button className="staff-signout" onClick={async () => {
      try {
        const result = await authClient.signOut();
        if (result.error) throw result.error;
        router.replace("/login"); router.refresh();
      } catch { setLogoutError("Tidak dapat keluar. Coba lagi."); }
    }}>Keluar</button>
    {logoutError && <p className="inline-alert" role="alert">{logoutError}</p>}
  </>;
  return <StaffShell role="Kasir" title={pathname.startsWith("/pos/transactions") ? "Riwayat Transaksi" : pathname.startsWith("/pos/payments") ? "Pembayaran" : "Meja & Pesanan"} navigation={navigation}>{children}</StaffShell>;
}
