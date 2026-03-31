"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const BAR_W = 200;
const BAR_H = 24;

export const HealthBar = memo(function HealthBar() {
  const health = useSyncExternalStore(hudState.subscribe, () => hudState.getField("health"));
  const maxHealth = useSyncExternalStore(hudState.subscribe, () => hudState.getField("maxHealth"));

  const pct = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;
  const low = pct < 0.25;

  return (
    <div style={{ position: "relative", width: BAR_W, height: BAR_H }}>
      {/* Red bar clipped by health % */}
      <div style={{
        position: "absolute", top: 0, left: 0,
        width: BAR_W * pct, height: BAR_H,
        overflow: "hidden",
        transition: "width 120ms linear",
      }}>
        <img
          src="/assets/sprites/ui/healthbar-full-red.png"
          alt=""
          style={{
            width: BAR_W, height: BAR_H,
            imageRendering: "pixelated",
            filter: low ? "brightness(1.4) saturate(1.5)" : "none",
          }}
          draggable={false}
        />
      </div>
      {/* Low health glow */}
      {low && (
        <div style={{
          position: "absolute", inset: 0,
          boxShadow: "0 0 8px rgba(255, 0, 0, 0.6), inset 0 0 4px rgba(255, 0, 0, 0.3)",
          pointerEvents: "none",
        }} />
      )}
    </div>
  );
});
