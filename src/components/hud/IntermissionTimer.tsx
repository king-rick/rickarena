"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

export const IntermissionTimer = memo(function IntermissionTimer() {
  const timer = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("intermissionTimer")
  );

  // Hide when inactive or during final 3-2-1 center countdown
  if (timer < 4) return null;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        alignSelf: "flex-start",
        gap: 8,
        padding: "6px 12px",
        background: "linear-gradient(180deg, rgba(8, 4, 12, 0.6) 0%, rgba(16, 8, 16, 0.65) 100%)",
        border: "1px solid rgba(255, 34, 68, 0.25)",
        borderRadius: 3,
        boxShadow: "0 0 8px rgba(0, 0, 0, 0.6), 0 0 4px rgba(255, 34, 68, 0.1)",
      }}
    >
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 16,
          color: "rgba(255, 34, 68, 0.6)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          lineHeight: 1,
        }}
      >
        Next Wave
      </span>
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 22,
          color: timer <= 10 ? "rgba(255, 100, 100, 0.9)" : "#e8e0e0",
          textShadow: "0 0 4px rgba(255, 34, 68, 0.3), 0 1px 2px rgba(0, 0, 0, 0.9)",
          letterSpacing: 1,
          lineHeight: 1,
        }}
      >
        {timer}s
      </span>
    </div>
  );
});
