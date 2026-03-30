"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const NATIVE_W = 90;
const NATIVE_H = 14;
const SCALE = 3.5;
const W = NATIVE_W * SCALE;
const H = NATIVE_H * SCALE;

export const HealthBar = memo(function HealthBar() {
  const health = useSyncExternalStore(hudState.subscribe, () => hudState.getField("health"));
  const maxHealth = useSyncExternalStore(hudState.subscribe, () => hudState.getField("maxHealth"));

  const pct = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;
  const low = pct < 0.25;

  return (
    <div style={{ position: "relative", width: W, height: H }}>
      {/* Empty track */}
      <img
        src="/assets/sprites/ui/bar-empty-top.png"
        alt=""
        style={{ position: "absolute", top: 0, left: 0, width: W, height: H, imageRendering: "pixelated" }}
        draggable={false}
      />
      {/* Full bar — width scales with HP */}
      <div style={{ position: "absolute", top: 0, left: 0, width: W * pct, height: H, overflow: "hidden", transition: "width 100ms linear" }}>
        <img
          src="/assets/sprites/ui/bar-full-red.png"
          alt=""
          style={{
            width: W,
            height: H,
            imageRendering: "pixelated",
            filter: low ? "brightness(1.3) saturate(1.5)" : "none",
          }}
          draggable={false}
        />
      </div>
      {low && (
        <div style={{
          position: "absolute",
          inset: 0,
          borderRadius: 2,
          boxShadow: "0 0 8px rgba(255, 0, 0, 0.6), inset 0 0 4px rgba(255, 0, 0, 0.3)",
          pointerEvents: "none",
        }} />
      )}
    </div>
  );
});
