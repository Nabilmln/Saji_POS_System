"use client";

import { Suspense, useRef, type ReactNode } from "react";
import { EntranceMotion } from "./entrance-motion";
import { formatDate, formatTime } from "@/lib/time";

export { TableAction, TableActions } from "./table-actions";

export function DataTable({ caption, columns, children, revision }: { caption: string; columns: string[]; children: ReactNode; revision: string }) {
  const content = useRef<HTMLTableSectionElement>(null);
  return <div className="table-scroll data-table-wrap" role="group" aria-label={caption} tabIndex={0}><table className="data-table" aria-label={caption}><thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody ref={content}>{children}</tbody></table><Suspense fallback={null}><EntranceMotion target={content} variant="content" revision={revision} /></Suspense></div>;
}

export function TableDateTime({ value, locale }: { value: string; locale: "id" | "en" }) {
  return <time className="table-date-time" dateTime={value}><span>{formatDate(value, locale)}</span><small>{formatTime(value, locale)} WIB</small></time>;
}
