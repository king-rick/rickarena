"use client";

import { memo, useSyncExternalStore, useEffect, useState } from "react";
import { hudState } from "@/game/HUDState";

const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

export const GameMessage = memo(function GameMessage() {
  const msg = useSyncExternalStore(hudState.subscribe, () => hudState.getField("gameMessage"));
  const msgKey = useSyncExternalStore(hudState.subscribe, () => hudState.getField("gameMessageKey"));
  const msgColor = useSyncExternalStore(hudState.subscribe, () => hudState.getField("gameMessageColor"));

  const [phase, setPhase] = useState<"hidden" | "in" | "hold" | "out">("hidden");

  useEffect(() => {
    if (!msg) { setPhase("hidden"); return; }
    setPhase("in");
    const holdTimer = setTimeout(() => setPhase("hold"), 100);
    const outTimer = setTimeout(() => setPhase("out"), 1600);
    const hideTimer = setTimeout(() => setPhase("hidden"), 2400);
    return () => { clearTimeout(holdTimer); clearTimeout(outTimer); clearTimeout(hideTimer); };
  }, [msgKey]);

  if (phase === "hidden" || !msg) return null;

  const opacity = phase === "in" ? 0 : phase === "out" ? 0 : 1;
  const translateY = phase === "out" ? -12 : 0;

  return (
    <div
      style={{
        position: "absolute",
        top: "38%",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          fontFamily: DISPLAY,
          fontSize: 28,
          fontWeight: "bold",
          color: msgColor || "#ffffff",
          textShadow: `0 0 8px ${msgColor || "#ffffff"}80, 0 2px 6px rgba(0,0,0,0.95), 0 0 20px rgba(0,0,0,0.7)`,
          letterSpacing: 2,
          opacity,
          transform: `translateY(${translateY}px)`,
          transition: phase === "in"
            ? "opacity 100ms ease-out"
            : "opacity 800ms ease-in, transform 800ms ease-in",
        }}
      >
        {msg}
      </div>
    </div>
  );
});
