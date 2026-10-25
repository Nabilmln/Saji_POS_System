"use client";

import { Suspense, useRef, type ReactNode } from "react";
import { EntranceMotion } from "@/components/ui/entrance-motion";
import { Photo } from "@/components/ui/photo";
import { useLocale } from "@/components/locale-provider";

export function MenuCard({ menu, children, badge, category, className = "" }: {
  menu: { name: string; description?: string | null; imageUrl: string | null; priceIdr: string };
  children: ReactNode; badge?: ReactNode; category?: string; className?: string;
}) {
  const { money } = useLocale();
  const content = useRef<HTMLElement>(null);
  return <article ref={content} className={`menu-card ${className}`}>
    <div className="menu-card-media"><Photo src={menu.imageUrl} menuName={menu.name} alt={menu.name} />{badge && <div className="menu-card-badge">{badge}</div>}</div>
    <div className="menu-card-copy">{category && <p className="menu-card-category">{category}</p>}<h3>{menu.name}</h3>{menu.description && <p>{menu.description}</p>}</div>
    <div className="menu-card-footer"><strong className="menu-price">{money(menu.priceIdr)}</strong><div className="menu-card-actions">{children}</div></div>
    <Suspense fallback={null}><EntranceMotion target={content} variant="content" revision={JSON.stringify(menu)} /></Suspense>
  </article>;
}
