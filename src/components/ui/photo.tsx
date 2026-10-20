"use client";

import { useLocale } from "@/components/locale-provider";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon } from "@phosphor-icons/react";
import { resolveMenuImage } from "@/lib/menu-images";

export function Photo({ src, alt = "", menuName, className = "menu-photo-frame" }: { src: string | null; alt?: string; menuName?: string; className?: string }) {
  const { t } = useLocale();
  const image = resolveMenuImage(src, menuName ?? alt);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <div className={`photo-frame ${className}`}>{image && failedUrl !== image ? <Image src={image} alt={alt} width={640} height={640} loading="lazy" unoptimized onError={() => setFailedUrl(image)} /> : <span className="photo-placeholder"><ImageIcon size={21} weight="light" aria-hidden="true" /><span>{t("Tanpa foto")}</span></span>}</div>;
}
