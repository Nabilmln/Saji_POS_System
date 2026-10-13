"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon } from "@phosphor-icons/react";

export function Photo({ src, alt = "", className = "menu-photo-frame" }: { src: string | null; alt?: string; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return <div className={`photo-frame ${className}`}>{src && failedUrl !== src ? <Image src={src} alt={alt} width={160} height={120} loading="lazy" unoptimized onError={() => setFailedUrl(src)} /> : <span className="photo-placeholder"><ImageIcon size={21} weight="light" aria-hidden="true" /><span>Tanpa foto</span></span>}</div>;
}
