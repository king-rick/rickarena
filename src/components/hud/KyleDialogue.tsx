"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const DISMISS_MS = 300;

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
  const canAdvance = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("kyleDialogueCanAdvance")
  );
  const manual = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("kyleDialogueManual")
  );

  useEffect(() => {
    setDismissing(false);
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, [quote]);

  const handleAdvance = useCallback(() => {
    if (!canAdvance) return;
    if (dismissing) return;
    setDismissing(true);
    setTimeout(() => {
      hudState.dispatchKyleDialogueAction("advance");
      setDismissing(false);
    }, DISMISS_MS);
  }, [dismissing, canAdvance]);

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

  const opacity = dismissing ? 0 : visible ? 1 : 0;

  return (
    <div
      onClick={handleAdvance}
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)",
        padding: "40px 0 28px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        opacity,
        transition: `opacity ${dismissing ? DISMISS_MS : 300}ms ease`,
        zIndex: 100,
        pointerEvents: manual && canAdvance ? "auto" : "none",
        cursor: manual && canAdvance ? "pointer" : "default",
      }}
    >
      {/* Speaker */}
      <span style={{
        fontFamily: "var(--font-special-elite), 'Special Elite', serif",
        fontSize: "clamp(11px, 1.4vw, 15px)",
        letterSpacing: "0.3em",
        color: "#4a9eda",
        textShadow: "0 0 10px rgba(65,140,200,0.7), 0 0 20px rgba(65,140,200,0.3)",
        textTransform: "uppercase",
      }}>
        {speaker}
      </span>

      {/* Quote */}
      <span style={{
        fontFamily: "var(--font-special-elite), 'Special Elite', serif",
        fontSize: "clamp(15px, 1.8vw, 22px)",
        color: "rgba(255,255,255,0.92)",
        textAlign: "center",
        fontStyle: "italic",
        maxWidth: 600,
        lineHeight: 1.6,
        textShadow: "0 2px 8px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,1)",
        padding: "0 24px",
      }}>
        &quot;{quote}&quot;
      </span>

      {/* Advance hint */}
      {manual && canAdvance && (
        <span style={{
          fontFamily: "var(--font-special-elite), 'Special Elite', serif",
          fontSize: "clamp(9px, 0.9vw, 11px)",
          color: "rgba(255,255,255,0.3)",
          letterSpacing: "0.2em",
          marginTop: 6,
          opacity: visible && !dismissing ? 1 : 0,
          transition: "opacity 500ms ease 600ms",
        }}>
          [ SPACE ]
        </span>
      )}
    </div>
  );
}
