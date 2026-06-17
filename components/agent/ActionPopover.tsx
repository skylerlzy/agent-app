"use client";

import { cn } from "@/lib/utils";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const GAP_PX = 10;
const VIEWPORT_MARGIN = 12;

export function ActionPopover({
  open,
  onClose,
  title,
  children,
  className,
  width = "w-[min(100vw-2rem,22rem)]",
  anchorEl,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
  width?: string;
  /** 锚定按钮元素，用于定位与点击外部关闭 */
  anchorEl: HTMLElement | null;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchorEl) {
      setCoords(null);
      return;
    }

    const update = () => {
      const panel = panelRef.current;
      if (!panel) return;

      const rect = anchorEl.getBoundingClientRect();
      const { offsetHeight: panelHeight, offsetWidth: panelWidth } = panel;
      const centerX = rect.left + rect.width / 2;
      const halfW = panelWidth / 2;
      const left = Math.min(
        window.innerWidth - VIEWPORT_MARGIN - halfW,
        Math.max(VIEWPORT_MARGIN + halfW, centerX)
      );

      let top = rect.top - GAP_PX - panelHeight;
      top = Math.max(VIEWPORT_MARGIN, top);

      setCoords({ top, left });
    };

    update();

    const panel = panelRef.current;
    const ro = panel ? new ResizeObserver(update) : null;
    if (panel && ro) ro.observe(panel);

    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorEl, title, children]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };
    const t = window.setTimeout(() => document.addEventListener("mousedown", onDoc), 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [open, onClose, anchorEl]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{
        top: coords?.top ?? 0,
        left: coords?.left ?? 0,
        transform: "translateX(-50%)",
        visibility: coords ? "visible" : "hidden",
        pointerEvents: coords ? "auto" : "none",
      }}
      className={cn("fixed z-[200]", width, className)}
      role="dialog"
      aria-label={title}
    >
      <div
        className={cn(
          "rounded-2xl border border-border/70 bg-card p-3 shadow-xl shadow-primary/15 backdrop-blur-md",
          coords && "motion-safe:animate-popover-rise"
        )}
      >
        <p className="mb-2.5 border-b border-border/50 pb-2 text-xs font-semibold text-foreground">{title}</p>
        {children}
      </div>
    </div>,
    document.body
  );
}
