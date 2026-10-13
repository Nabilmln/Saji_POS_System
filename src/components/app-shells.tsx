"use client";

import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { QrCodeIcon, ReceiptIcon } from "@phosphor-icons/react";
import { Brand } from "@/components/ui/brand";

const DetailTarget = createContext<HTMLElement | null>(null);

export function DetailPane({ children }: { children: ReactNode }) {
  const target = useContext(DetailTarget);
  return target ? createPortal(<div className="detail-pane">{children}</div>, target) : null;
}

export function CustomerShell({ tableNumber, children, footer }: {
  tableNumber?: string; children: ReactNode; footer?: ReactNode;
}) {
  return <div className="customer-page">
    <header className="customer-header">
      <Link className="brand-link" href="/" aria-label="Saji beranda"><Brand /></Link>
      {tableNumber && <span className="table-badge">Meja {tableNumber}</span>}
    </header>
    <main className="customer-main">{children}</main>
    {footer}
  </div>;
}

export function StaffShell({ role, title, navigation, children }: {
  role: "Kasir" | "Admin"; title: string; navigation: ReactNode; children: ReactNode;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  return <DetailTarget value={target}><div className="staff-shell">
    <aside className="staff-sidebar" aria-label={`Navigasi ${role}`}>
      <Brand />
      <p className="staff-nav-label">{role === "Admin" ? "Ruang pemilik" : "Ruang kasir"}</p>
      <nav>{navigation}</nav>
    </aside>
    <main className="staff-content"><header className="workspace-heading"><h1>{title}</h1><span className="workspace-role">{role === "Admin" ? "Pemilik" : "Kasir"}</span></header>{children}</main>
    <aside ref={setTarget} className="workspace-detail" aria-label={role === "Admin" ? "Detail pemilik" : "Detail pesanan"}><div className="detail-placeholder">{role === "Admin" ? <QrCodeIcon size={32} weight="light" /> : <ReceiptIcon size={32} weight="light" />}<h2>{role === "Admin" ? "Rincian pilihan" : "Detail pesanan"}</h2><p>{role === "Admin" ? "Pilih item di area utama untuk melihat rinciannya." : "Pilih meja untuk meninjau pesanan dan status penyajian."}</p></div></aside>
  </div></DetailTarget>;
}
