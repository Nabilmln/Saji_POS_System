import type { ReactNode } from "react";
import { StatusBadge } from "./status-badge";
import { TableActions } from "./table-actions";
import "./table-card.css";

export function TableCard({ titleId, title, status, selected = false, className, metadata, children, primaryAction, actions }: {
  titleId: string; title: ReactNode; status: string; selected?: boolean; className: string;
  metadata: { label: ReactNode; value: ReactNode }; children?: ReactNode; primaryAction: ReactNode; actions?: ReactNode;
}) {
  return <article className={`table-card ${className}${selected ? " table-card-selected selected" : ""}`} aria-labelledby={titleId}>
    <header className="table-card-heading"><h3 id={titleId}>{title}</h3><StatusBadge status={status} /></header>
    <div className="table-card-body">{children && <div className="table-card-counts pos-order-counts">{children}</div>}<div className="table-card-metadata"><span>{metadata.label}</span><div>{metadata.value}</div></div></div>
    <footer className="table-card-footer"><div className="table-card-primary-action">{primaryAction}</div>{actions && <TableActions>{actions}</TableActions>}</footer>
  </article>;
}
