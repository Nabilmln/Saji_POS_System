"use client";

import { useEffect, type RefObject } from "react";
import { usePathname } from "next/navigation";

export function EntranceMotion({ target, variant = "page", revision }: {
  target: RefObject<HTMLElement | SVGElement | null>; variant?: "page" | "chart"; revision?: unknown;
}) {
  const pathname = usePathname();
  useEffect(() => {
    const element = target.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!element || reducedMotion.matches) return;
    const frames = variant === "chart" ? [
      { clipPath: "inset(0 100% 0 0)" },
      { clipPath: "inset(0 0 0 0)" },
    ] : [
      { opacity: 0.9, transform: "translateY(4px)" },
      { opacity: 1, transform: "translateY(0)" },
    ];
    const animation = element.animate(frames, { duration: variant === "chart" ? 450 : 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    const cancel = () => animation.cancel();
    reducedMotion.addEventListener("change", cancel);
    return () => { reducedMotion.removeEventListener("change", cancel); animation.cancel(); };
  }, [pathname, target, variant, revision]);
  return null;
}
