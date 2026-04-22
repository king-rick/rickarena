"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";
const BODY = "var(--font-special-elite), 'Special Elite', serif";

export const IntermissionOverlay = memo(function IntermissionOverlay() {
  const waveState = useSyncExternalStore(hudState.subscribe, () => hudState.getField("waveState"));
  const countdown = useSyncExternalStore(hudState.subscribe, () => hudState.getField("waveCountdown"));
  const wave = useSyncExternalStore(hudState.subscribe, () => hudState.getField("wave"));
  const shopOpen = useSyncExternalStore(hudState.subscribe, () => hudState.getField("shopOpen"));

  if (waveState !== "intermission" || shopOpen) return null;

  const secs = Math.max(0, Math.ceil(countdown));
  // Hide the small countdown when the big Countdown component is showing (<=5s)
  const showTimer = secs > 5;

  return (
    <div
      className="absolute flex flex-col items-center justify-end pointer-events-none"
      style={{
        inset: 0,
        paddingBottom: 80,
        gap: 12,
      }}
    >
      {/* Next wave label */}
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 28,
          color: "#ccccdd",
          letterSpacing: "0.15em",
          textShadow: "0 2px 8px rgba(0, 0, 0, 0.9), 0 0 16px rgba(0, 0, 0, 0.7)",
        }}
      >
        NEXT WAVE IN
      </span>

      {/* Timer — only when > 5s (big Countdown handles <=5) */}
      {showTimer && (
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: 48,
            color: "#ffffff",
            textShadow: "0 0 12px rgba(255, 255, 255, 0.15)",
            lineHeight: 1,
          }}
        >
          {secs}
        </span>
      )}

      {/* Divider */}
      <div
        style={{
          width: 200,
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(255, 34, 68, 0.3), transparent)",
          margin: "4px 0",
        }}
      />

      {/* Controls */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: 20,
            color: "#ff4466",
            textShadow: "0 0 12px rgba(255, 34, 68, 0.6), 0 2px 6px rgba(0, 0, 0, 0.9)",
            animation: "pulse-glow 2s ease-in-out infinite",
          }}
        >
          SPACE to start round
        </span>
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: 16,
            color: "#999",
            textShadow: "0 2px 6px rgba(0, 0, 0, 0.9), 0 0 10px rgba(0, 0, 0, 0.7)",
          }}
        >
          B to open shop
        </span>
      </div>
    </div>
  );
});
