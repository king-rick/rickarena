"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

/** Formats seconds into M:SS */
const fmtTime = (totalSeconds: number): string => {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export const WaveInfo = memo(function WaveInfo() {
  // wave field now holds survival seconds
  const survivalSecs = useSyncExternalStore(hudState.subscribe, () => hudState.getField("wave"));

  return (
    <span
      style={{
        fontFamily: DISPLAY,
        fontSize: 22,
        color: "#ff2244",
        letterSpacing: "0.08em",
        textShadow: "0 0 6px rgba(255, 34, 68, 0.4), 0 1px 3px rgba(0, 0, 0, 0.9)",
      }}
    >
      {fmtTime(survivalSecs)}
    </span>
  );
});
