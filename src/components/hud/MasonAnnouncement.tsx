"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const DISMISS_MS = 400;

export function MasonAnnouncement() {
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const quote = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("masonDialogueQuote")
  );

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleDismiss = () => {
    if (dismissing) return;
    setDismissing(true);
    setTimeout(() => {
      hudState.dispatchMasonDialogueAction("dismissed");
    }, DISMISS_MS);
  };

  const translateY = dismissing ? "100%" : visible ? "0%" : "100%";
  const transition = dismissing
    ? `transform ${DISMISS_MS}ms ease-in, opacity ${DISMISS_MS}ms ease-in`
    : "transform 400ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms ease-out";
  const opacity = dismissing ? 0 : visible ? 1 : 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(5,0,5,0.88) 100%)",
        borderTop: "2px solid rgba(124,58,237,0.7)",
        padding: "18px 48px 22px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        transform: `translateY(${translateY})`,
        opacity,
        transition,
        zIndex: 100,
      }}
    >
      {/* Name */}
      <div style={{
        fontFamily: "var(--font-special-elite), 'Special Elite', serif",
        fontSize: "clamp(18px, 2.5vw, 34px)",
        letterSpacing: "0.45em",
        color: "#7c3aed",
        textTransform: "uppercase",
        textShadow: "0 0 18px rgba(124,58,237,0.9), 0 0 40px rgba(124,58,237,0.4)",
      }}>
        B I G B A B Y
      </div>

      {/* Quote */}
      <div style={{
        fontFamily: "var(--font-special-elite), 'Special Elite', serif",
        fontSize: "clamp(13px, 1.6vw, 20px)",
        color: "rgba(215, 195, 230, 0.92)",
        textAlign: "center",
        fontStyle: "italic",
        maxWidth: 520,
        lineHeight: 1.65,
        textShadow: "0 1px 6px rgba(0,0,0,1)",
      }}>
        &quot;{quote}&quot;
      </div>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={handleDismiss}
        style={{
          marginTop: 10,
          background: "transparent",
          border: "1px solid rgba(124,58,237,0.55)",
          color: "rgba(190,165,220,0.82)",
          fontFamily: "var(--font-special-elite), 'Special Elite', serif",
          fontSize: "clamp(9px, 1vw, 12px)",
          letterSpacing: "0.22em",
          padding: "6px 20px",
          cursor: "pointer",
          textTransform: "uppercase",
          opacity: visible && !dismissing ? 1 : 0,
          transition: visible && !dismissing
            ? "opacity 400ms ease-out 500ms, background 150ms, color 150ms, border-color 150ms"
            : "opacity 200ms ease-out",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = "rgba(124,58,237,0.22)";
          el.style.color = "#fff";
          el.style.borderColor = "rgba(167,100,255,0.9)";
          el.style.textShadow = "0 0 12px rgba(167,100,255,0.8), 0 0 24px rgba(124,58,237,0.4)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = "transparent";
          el.style.color = "rgba(190,165,220,0.82)";
          el.style.borderColor = "rgba(124,58,237,0.55)";
          el.style.textShadow = "none";
        }}
      >
        Bring it &nbsp;&middot;&nbsp; [ SPACE ]
      </button>
    </div>
  );
}
