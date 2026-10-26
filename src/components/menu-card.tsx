"use client";

import { Suspense, useRef, type ReactNode } from "react";
import { EntranceMotion } from "@/components/ui/entrance-motion";
import { Photo } from "@/components/ui/photo";
import { useLocale } from "@/components/locale-provider";

export function MenuCard({
  menu,
  children,
  badge,
  category,
  className = "",
}: {
  menu: { name: string; description?: string | null; imageUrl: string | null; priceIdr: string };
  children?: ReactNode;
  badge?: ReactNode;
  category?: string;
  className?: string;
}) {
  const { money } = useLocale();
  const content = useRef<HTMLElement>(null);

  return (
    <article ref={content} className={`menu-card ${className}`.trim()}>
      <div className="menu-card-media">
        <Photo src={menu.imageUrl} menuName={menu.name} alt={menu.name} />
        <span className="menu-card-price-tag">{money(menu.priceIdr)}</span>
      </div>
      <div className="menu-card-copy">
        <h3 className="menu-card-title">{menu.name}</h3>
        {menu.description ? (
          <p className="menu-card-description">{menu.description}</p>
        ) : (
          <p className="menu-card-description is-empty" aria-hidden="true" />
        )}
        {(category || badge) && (
          <div className="menu-card-badges">
            {category && <span className="menu-badge-category">{category}</span>}
            {badge && <div className="menu-badge-status">{badge}</div>}
          </div>
        )}
      </div>
      {children && (
        <>
          <div className="menu-card-divider" aria-hidden="true" />
          <div className="menu-card-footer">{children}</div>
        </>
      )}
      <Suspense fallback={null}>
        <EntranceMotion target={content} variant="content" revision={JSON.stringify(menu)} />
      </Suspense>
    </article>
  );
}
