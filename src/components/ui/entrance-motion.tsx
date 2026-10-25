"use client";

import { useEffect, type RefObject } from "react";
import { usePathname } from "next/navigation";

export function EntranceMotion({ target, variant = "page", revision }: {
  target: RefObject<HTMLElement | SVGElement | null>; variant?: "page" | "chart" | "content"; revision?: unknown;
}) {
  const pathname = usePathname();
  useEffect(() => {
    const element = target.current;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!element || reducedMotion.matches) return;
    const frames = variant === "chart" ? [
      { clipPath: "inset(0 100% 0 0)" },
      { clipPath: "inset(0 0 0 0)" },
    ] : variant === "content" ? [{ opacity: 0.8 }, { opacity: 1 }] : [
      { opacity: 0.9, transform: "translateY(4px)" },
      { opacity: 1, transform: "translateY(0)" },
    ];
    let animation: Animation;
    let frame = 0;
    const play = () => {
      animation?.cancel();
      animation = element.animate(frames, { duration: variant === "chart" ? 450 : variant === "content" ? 180 : 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)" });
    };
    play();
    // Inline workspaces and streamed pages can replace the view without changing the URL.
    const observer = variant === "page" ? new MutationObserver((changes) => {
      if (changes.some((change) => [...change.addedNodes, ...change.removedNodes].some((node) => node instanceof Element))) {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(play);
      }
    }) : null;
    observer?.observe(element, { childList: true });
    const cancel = () => { cancelAnimationFrame(frame); observer?.disconnect(); animation.cancel(); };
    reducedMotion.addEventListener("change", cancel);
    return () => { reducedMotion.removeEventListener("change", cancel); cancel(); };
  }, [pathname, target, variant, revision]);
  return null;
}
