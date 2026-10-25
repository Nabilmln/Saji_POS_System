"use client";

import { Suspense, useRef, type ReactNode } from "react";
import { EntranceMotion } from "./entrance-motion";
import { StatusBadge } from "./status-badge";
import { TableActions } from "./table-actions";
import "./table-card.css";

export function TableCard({ titleId, title, status, selected = false, className, metadata, children, primaryAction, actions, revision }: {
  titleId: string; title: ReactNode; status: string; selected?: boolean; className: string;
  metadata: { label: ReactNode; value: ReactNode }; children?: ReactNode; primaryAction: ReactNode; actions?: ReactNode; revision: string;
}) {
  const content = useRef<HTMLElement>(null);
  return <article ref={content} className={`table-card ${className}${selected ? " table-card-selected selected" : ""}`} aria-labelledby={titleId}>
    <header className="table-card-heading"><h3 id={titleId}>{title}</h3><StatusBadge status={status} /></header>
    <div className="table-card-body">{children && <div className="table-card-counts pos-order-counts">{children}</div>}<div className="table-card-metadata"><span>{metadata.label}</span><div>{metadata.value}</div></div></div>
    <footer className="table-card-footer"><div className="table-card-primary-action">{primaryAction}</div>{actions && <TableActions>{actions}</TableActions>}</footer>
    <Suspense fallback={null}><EntranceMotion target={content} variant="content" revision={revision} /></Suspense>
  </article>;
}
