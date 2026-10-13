"use client";

import { useLocale } from "@/components/locale-provider";
import { BowlFoodIcon } from "@phosphor-icons/react/ssr";

export function Brand({ compact = false }: { compact?: boolean }) {
  const { t } = useLocale();
  return <span className="brand"><span className="brand-mark" aria-hidden="true"><BowlFoodIcon size={23} weight="bold" /></span>{!compact && <span className="brand-wordmark">saji<span className="brand-caption">{t("Ruang restoran")}</span></span>}</span>;
}
