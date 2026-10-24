import type { HTMLAttributes } from "react";

type Shape = "detail" | "table" | "menu" | "cards" | "report" | "form" | "page";

function Lines() {
  return <><span className="skeleton-line" /><span className="skeleton-line skeleton-line-short" /></>;
}

function Rows({ table = false }: { table?: boolean }) {
  return <div className={table ? "skeleton-table" : "skeleton-rows"}>
    {Array.from({ length: 5 }, (_, index) => <div className="skeleton-row" key={index}>
      {table ? <>{Array.from({ length: 4 }, (_, column) => <span className="skeleton-line" key={column} />)}</> : <><span className="skeleton-image" /><div className="skeleton-copy"><Lines /></div><span className="skeleton-line skeleton-amount" /></>}
    </div>)}
  </div>;
}

function Content({ variant }: { variant: Shape }) {
  if (variant === "menu" || variant === "cards") return <div className={variant === "menu" ? "admin-menu-grid skeleton-grid" : "pos-table-grid skeleton-grid"}>
    {Array.from({ length: variant === "menu" ? 8 : 6 }, (_, index) => <div className="skeleton-card" key={index}>
      {variant === "menu" && <div className="skeleton-menu-image" />}<div className="skeleton-card-copy"><Lines /><span className="skeleton-control" /></div>
    </div>)}
  </div>;
  if (variant === "report") return <div className="sales-bento">
    {["revenue", "count", "average", "daily-average"].map((name) => <div className={`bento-cell bento-stat bento-${name} skeleton-metric`} key={name}><Lines /><span className="skeleton-control" /></div>)}
    <div className="bento-cell bento-chart"><span className="skeleton-line skeleton-line-short" /><div className="skeleton-chart" /></div>
    <div className="bento-cell bento-activity"><Lines /><div className="skeleton-chart" /></div>
    <div className="bento-cell bento-menus"><Rows /></div>
    <div className="bento-daily"><div className="bento-cell"><Rows table /></div></div>
  </div>;
  if (variant === "form") return <div className="skeleton-form">{Array.from({ length: 3 }, (_, index) => <div className="skeleton-copy" key={index}><span className="skeleton-line skeleton-line-short" /><span className="skeleton-control" /></div>)}</div>;
  if (variant === "page") return <><div className="skeleton-toolbar"><span className="skeleton-control" /><span className="skeleton-control" /></div><Rows table /></>;
  return <Rows table={variant === "table"} />;
}

export function LoadingState({ children, className = "loading-block", variant = "detail", ...props }: HTMLAttributes<HTMLDivElement> & { variant?: Shape }) {
  return <div className={`${className} loading-skeleton`} role="status" aria-busy="true" {...props}>
    <span className="loading-label">{children}</span>
    <div className="skeleton-content" aria-hidden="true"><Content variant={variant} /></div>
  </div>;
}
