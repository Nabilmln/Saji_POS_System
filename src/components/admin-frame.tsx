"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { StaffShell } from "@/components/app-shells";
import { adminApi, AdminApiError } from "@/lib/admin/client";
import { authClient } from "@/lib/auth/client";

type Identity = { displayName: string };
const links = [
  { href: "/admin/menus", label: "Menu & Kategori" },
  { href: "/admin/tables", label: "Meja & QR" },
  { href: "/admin/settings", label: "Diskon & Pajak" },
];

export function AdminFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "login" | "forbidden" | "error">("loading");
  const [logoutError, setLogoutError] = useState("");
  useEffect(() => {
    let active = true;
    adminApi<Identity>("/api/admin/me")
      .then((data) => { if (active) { setIdentity(data); setState("ready"); } })
      .catch((cause: unknown) => {
        if (!active) return;
        setState(cause instanceof AdminApiError && cause.status === 401 ? "login" :
          cause instanceof AdminApiError && cause.status === 403 ? "forbidden" : "error");
      });
    return () => { active = false; };
  }, []);

  if (state !== "ready") return <main className="entry-page">
    <div className="brand-mark" aria-hidden="true">S</div>
    <p className="eyebrow">AREA ADMIN</p>
    <h1>{state === "loading" ? "Memeriksa akses…" : state === "login" ? "Masuk diperlukan" : state === "forbidden" ? "Akses ditolak" : "Tidak dapat memuat halaman"}</h1>
    <p>{state === "login" ? "Silakan masuk dengan akun Admin." : state === "forbidden" ? "Akun ini tidak memiliki izin Admin." : state === "error" ? "Periksa koneksi, lalu muat ulang halaman." : ""}</p>
    {state === "error" ? <button className="primary-button" onClick={() => window.location.reload()}>Coba Lagi</button> :
      state !== "loading" && <Link className="primary-button" href="/login">Masuk Staf</Link>}
  </main>;

  const navigation = <>
    {links.map((link) => <Link key={link.href} className={`staff-nav-item ${pathname.startsWith(link.href) ? "active" : ""}`} href={link.href} aria-current={pathname.startsWith(link.href) ? "page" : undefined}>{link.label}</Link>)}
    <p className="staff-nav-label">AKUN</p>
    <p className="staff-account">{identity?.displayName}</p>
    <button className="staff-signout" onClick={async () => {
      try {
        const result = await authClient.signOut();
        if (result.error) throw result.error;
        router.replace("/login"); router.refresh();
      } catch { setLogoutError("Tidak dapat keluar. Coba lagi."); }
    }}>Keluar</button>
    {logoutError && <p className="inline-alert" role="alert">{logoutError}</p>}
  </>;
  const title = pathname.startsWith("/admin/tables") ? "Meja & QR" : pathname.startsWith("/admin/settings") ? "Diskon & Pajak" : "Menu & Kategori";
  return <StaffShell role="Admin" title={title} navigation={navigation}>{children}</StaffShell>;
}
