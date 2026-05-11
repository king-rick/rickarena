"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

export const TopStats = memo(function TopStats() {
  const kills = useSyncExternalStore(hudState.subscribe, () => hudState.getField("kills"));
  const currency = useSyncExternalStore(hudState.subscribe, () => hudState.getField("currency"));

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <StatItem icon="/assets/sprites/ui/icon-skull.png" value={`${kills}`} />
      <StatItem icon="/assets/sprites/ui/icon-cash.png" value={`${currency}`} />
    </div>
  );
});

function StatItem({ icon, value }: { icon: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <img
        src={icon}
        alt=""
        style={{
          width: 20,
          height: 20,
          imageRendering: "pixelated",
          flexShrink: 0,
        }}
        draggable={false}
      />
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 16,
          fontWeight: "bold",
          color: "#e8e0e0",
          textShadow: "0 0 4px rgba(255, 34, 68, 0.3), 0 1px 2px rgba(0, 0, 0, 0.9)",
          letterSpacing: 1,
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  );
}
