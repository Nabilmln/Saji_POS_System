"use client";

import type { ReactNode } from "react";
import { useLocale } from "@/components/locale-provider";
import { Panel } from "./controls";

export function Section({ id, title, description, actions, children }: { id: string; title: string; description?: string; actions?: ReactNode; children: ReactNode }) {
  const { t } = useLocale();
  return <Panel id={id} aria-labelledby={`${id}-heading`} className="admin-panel action-section"><header className="section-heading"><div><h2 id={`${id}-heading`}>{t(title)}</h2>{description && <p>{t(description)}</p>}</div>{actions}</header>{children}</Panel>;
}

export function SectionNav({ sections }: { sections: { id: string; label: string }[] }) {
  const { t } = useLocale();
  return <nav className="section-nav" aria-label={t("Bagian halaman")}>{sections.map((section) => <a href={`#${section.id}`} key={section.id}>{t(section.label)}</a>)}</nav>;
}
