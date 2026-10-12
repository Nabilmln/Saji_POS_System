import Link from "next/link";
import type { ReactNode } from "react";

export function CustomerShell({ tableNumber, children, footer }: {
  tableNumber?: string; children: ReactNode; footer?: ReactNode;
}) {
  return <div className="customer-page">
    <header className="customer-header">
      <Link className="brand" href="/"><span className="brand-mark" aria-hidden="true">S</span><span>Pesan dari Meja</span></Link>
      {tableNumber && <span className="table-badge">Meja {tableNumber}</span>}
    </header>
    <main className="customer-main">{children}</main>
    {footer}
  </div>;
}

// Shells for FE-03/FE-04. Navigation is rendered by authorized pages only.
export function StaffShell({ role, title, navigation, children }: {
  role: "Kasir" | "Admin"; title: string; navigation: ReactNode; children: ReactNode;
}) {
  return <div className="staff-shell">
    <aside className="staff-sidebar" aria-label={`Navigasi ${role}`}>
      <div className="brand"><span className="brand-mark" aria-hidden="true">S</span><span>Restaurant POS</span></div>
      <p className="staff-nav-label">{role.toUpperCase()}</p>
      <nav>{navigation}</nav>
    </aside>
    <main className="staff-content"><p className="eyebrow">{role.toUpperCase()}</p><h1>{title}</h1>{children}</main>
  </div>;
}
