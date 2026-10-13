import type { ReactNode } from "react";

export function DataTable({ caption, columns, children }: { caption: string; columns: string[]; children: ReactNode }) {
  return <div className="table-scroll data-table-wrap" role="group" aria-label={caption} tabIndex={0}><table className="data-table"><caption>{caption}</caption><thead><tr>{columns.map((column) => <th key={column} scope="col">{column}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}
