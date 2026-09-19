"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll narrative beat. Reveals once on intersection and never re-hides — re-animating on
 * every scroll pass is the thing that makes pages feel restless.
 */
export function Beat({
  accent = "var(--rule-3)", children, driftTo,
}: {
  accent?: string;
  children: React.ReactNode;
  driftTo?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const reveal = () => {
      el.classList.add("shown");
      const drift = el.querySelector<HTMLElement>("[data-drift]");
      if (drift && driftTo) setTimeout(() => { drift.style.left = driftTo; }, reduce ? 0 : 260);
    };
    if (reduce || !("IntersectionObserver" in window)) { reveal(); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) { reveal(); io.unobserve(e.target); } }),
      { rootMargin: "0px 0px -12% 0px", threshold: 0.2 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [driftTo]);

  return (
    <div
      ref={ref}
      className="beat"
      style={{
        display: "flex", flexWrap: "wrap", gap: 32, padding: "34px 4px 34px 22px",
        borderLeft: `2px solid ${accent}`, borderTop: "1px solid var(--rule)",
      }}
    >
      {children}
    </div>
  );
}
