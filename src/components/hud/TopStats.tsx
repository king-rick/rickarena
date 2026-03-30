"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";

export const TopStats = memo(function TopStats() {
  const kills = useSyncExternalStore(hudState.subscribe, () => hudState.getField("kills"));
  const currency = useSyncExternalStore(hudState.subscribe, () => hudState.getField("currency"));
  const level = useSyncExternalStore(hudState.subscribe, () => hudState.getField("level"));

  return (
    <div className="flex items-center gap-4">
      <StatItem icon="/assets/sprites/ui/icon-star.png" value={`${level}`} size={20} />
      <StatItem icon="/assets/sprites/ui/icon-skull.png" value={`${kills}`} size={20} />
      <StatItem icon="/assets/sprites/ui/icon-cash.png" value={`${currency}`} size={20} />
    </div>
  );
});

function StatItem({ icon, value, size = 18 }: { icon: string; value: string; size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      <img
        src={icon}
        alt=""
        style={{
          width: size,
          height: size,
          imageRendering: "pixelated",
          flexShrink: 0,
        }}
        draggable={false}
      />
      <span
        style={{
          fontFamily: BODY,
          fontSize: 18,
          fontWeight: 700,
          color: "#ffffff",
          textShadow: "0 0 6px rgba(255, 34, 68, 0.5), 0 0 12px rgba(255, 34, 68, 0.2), 0 1px 2px rgba(0, 0, 0, 0.9)",
          letterSpacing: "0.06em",
          lineHeight: 1,
          verticalAlign: "middle",
        }}
      >
        {value}
      </span>
    </div>
  );
}
