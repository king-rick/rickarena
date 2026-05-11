"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const DISMISS_MS = 350;

export function KyleDialogue() {
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  const speaker = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("kyleDialogueSpeaker")
  );
  const quote = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("kyleDialogueQuote")
  );

  useEffect(() => {
    setDismissing(false);
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, [quote]);

  const handleAdvance = useCallback(() => {
    if (dismissing) return;
    setDismissing(true);
    setTimeout(() => {
      hudState.dispatchKyleDialogueAction("advance");
      setDismissing(false);
    }, DISMISS_MS);
  }, [dismissing]);

  // Space key to advance
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handleAdvance();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleAdvance]);

  const translateY = dismissing ? "100%" : visible ? "0%" : "100%";
  const opacity = dismissing ? 0 : visible ? 1 : 0;
  const transition = dismissing
    ? `transform ${DISMISS_MS}ms ease-in, opacity ${DISMISS_MS}ms ease-in`
    : "transform 400ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms ease-out";

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(5,10,15,0.90) 100%)",
        borderTop: "2px solid rgba(65,140,200,0.6)",
        padding: "18px 48px 22px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        transform: `translateY(${translateY})`,
        opacity,
        transition,
        zIndex: 100,
        pointerEvents: "auto",
      }}
    >
      {/* Speaker name */}
      <div style={{
        fontFamily: "var(--font-special-elite), 'Special Elite', serif",
        fontSize: "clamp(16px, 2.2vw, 28px)",
        letterSpacing: "0.35em",
        color: "#4a9eda",
        textTransform: "uppercase",
        textShadow: "0 0 14px rgba(65,140,200,0.8), 0 0 30px rgba(65,140,200,0.3)",
      }}>
        {speaker}
      </div>

      {/* Quote */}
      <div style={{
        fontFamily: "var(--font-special-elite), 'Special Elite', serif",
        fontSize: "clamp(13px, 1.6vw, 20px)",
        color: "rgba(210, 220, 230, 0.92)",
        textAlign: "center",
        fontStyle: "italic",
        maxWidth: 560,
        lineHeight: 1.65,
        textShadow: "0 1px 6px rgba(0,0,0,1)",
      }}>
        &quot;{quote}&quot;
      </div>

      {/* Continue button */}
      <button
        type="button"
        onClick={handleAdvance}
        style={{
          marginTop: 8,
          background: "transparent",
          border: "1px solid rgba(65,140,200,0.45)",
          color: "rgba(170,200,220,0.82)",
          fontFamily: "var(--font-special-elite), 'Special Elite', serif",
          fontSize: "clamp(9px, 1vw, 12px)",
          letterSpacing: "0.22em",
          padding: "6px 20px",
          cursor: "pointer",
          textTransform: "uppercase",
          opacity: visible && !dismissing ? 1 : 0,
          transition: visible && !dismissing
            ? "opacity 400ms ease-out 400ms, background 150ms, color 150ms, border-color 150ms"
            : "opacity 200ms ease-out",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget;
          el.style.background = "rgba(65,140,200,0.18)";
          el.style.color = "#fff";
          el.style.borderColor = "rgba(100,170,230,0.9)";
          el.style.textShadow = "0 0 12px rgba(100,170,230,0.7)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget;
          el.style.background = "transparent";
          el.style.color = "rgba(170,200,220,0.82)";
          el.style.borderColor = "rgba(65,140,200,0.45)";
          el.style.textShadow = "none";
        }}
      >
        Continue &nbsp;&middot;&nbsp; [ SPACE ]
      </button>
    </div>
  );
}
