import type { ReactNode } from "react";

/**
 * Hides content visually while keeping it available to assistive technology.
 * The first real component in the shared design system (UI-010 DESIGN_SYSTEM.md) —
 * deliberately minimal for Phase 1; campaign/chat components land starting Phase 6/7.
 */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        position: "absolute",
        width: "1px",
        height: "1px",
        padding: 0,
        margin: "-1px",
        overflow: "hidden",
        clip: "rect(0, 0, 0, 0)",
        whiteSpace: "nowrap",
        border: 0,
      }}
    >
      {children}
    </span>
  );
}
