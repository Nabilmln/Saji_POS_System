import Image from "next/image";

export function Brand({ compact = false }: { compact?: boolean }) {
  return <span className="brand"><span className="brand-mark" aria-hidden="true"><Image src="/icon.svg" alt="" width={36} height={36} unoptimized /></span>{!compact && <span className="brand-wordmark">saji</span>}</span>;
}
