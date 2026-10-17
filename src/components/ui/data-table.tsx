import type { ReactNode } from "react";
import { formatDate, formatTime } from "@/lib/time";

export function DataTable({ caption, columns, children }: { caption: string; columns: string[]; children: ReactNode }) {
  return <div className="table-scroll data-table-wrap" role="group" aria-label={caption} tabIndex={0}><table className="data-table" aria-label={caption}><thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

export function TableDateTime({ value, locale }: { value: string; locale: "id" | "en" }) {
  return <time className="table-date-time" dateTime={value}><span>{formatDate(value, locale)}</span><small>{formatTime(value, locale)} WIB</small></time>;
}
