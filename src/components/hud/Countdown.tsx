"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

export const Countdown = memo(function Countdown() {
  const countdown = useSyncExternalStore(hudState.subscribe, () => hudState.getField("waveCountdown"));
  const key = useSyncExternalStore(hudState.subscribe, () => hudState.getField("countdownKey"));

  if (countdown < 1 || countdown > 5) return null;

  return (
    <div
      key={key}
      className="absolute flex items-center justify-center pointer-events-none"
      style={{ inset: 0, zIndex: 17 }}
    >
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 128,
          color: "#ff2244",
          textShadow: "0 0 30px rgba(255, 34, 68, 0.7), 0 4px 12px rgba(0, 0, 0, 0.9)",
          animation: "countdown-pulse 0.9s cubic-bezier(0.33, 0, 0.67, 1) forwards",
        }}
      >
        {countdown}
      </span>
    </div>
  );
});
