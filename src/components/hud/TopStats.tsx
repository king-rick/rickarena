"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";
const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

export const TopStats = memo(function TopStats() {
  const kills = useSyncExternalStore(hudState.subscribe, () => hudState.getField("kills"));
  const currency = useSyncExternalStore(hudState.subscribe, () => hudState.getField("currency"));
  const level = useSyncExternalStore(hudState.subscribe, () => hudState.getField("level"));

  return (
    <div className="flex items-center gap-4">
      <StatItem label="LV" value={`${level}`} color="#cc9933" />
      <StatItem label="KILLS" value={`${kills}`} color="#cc3344" />
      <StatItem label="$" value={`${currency}`} color="#88aa44" />
    </div>
  );
});

function StatItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-baseline gap-1">
      <span
        style={{
          fontFamily: BODY,
          fontSize: 12,
          color: "#666677",
          letterSpacing: "0.05em",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 20,
          color,
          textShadow: `0 0 6px ${color}44`,
        }}
      >
        {value}
      </span>
    </div>
  );
}
