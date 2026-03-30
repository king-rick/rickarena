"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

// Native sprite: 128x32. Red fill area: x 23-122, y 11-22 (99px wide, 11px tall).
const NATIVE_W = 128;
const NATIVE_H = 32;
const FILL_X = 23;
const FILL_Y = 11;
const FILL_W = 99;
const FILL_H = 11;

const SCALE = 1.125;

export const HealthBar = memo(function HealthBar() {
  const health = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("health")
  );
  const maxHealth = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("maxHealth")
  );

  const pct = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;
  const low = pct < 0.25;

  const w = Math.round(NATIVE_W * SCALE);
  const h = Math.round(NATIVE_H * SCALE);

  // Fill area in scaled coordinates
  const fillX = Math.round(FILL_X * SCALE);
  const fillY = Math.round(FILL_Y * SCALE);
  const fillW = Math.round(FILL_W * SCALE);
  const fillH = Math.round(FILL_H * SCALE);

  return (
    <div
      style={{
        position: "relative",
        width: w,
        height: h,
        filter: low ? "drop-shadow(0 0 6px rgba(255, 0, 0, 0.6))" : "none",
      }}
    >
      {/* Dark background behind the bar area */}
      <div
        style={{
          position: "absolute",
          top: fillY,
          left: fillX,
          width: fillW,
          height: fillH,
          background: "#0a0a0a",
        }}
      />
      {/* Red fill clipped to HP% */}
      <div
        style={{
          position: "absolute",
          top: fillY,
          left: fillX,
          width: fillW * pct,
          height: fillH,
          overflow: "hidden",
          transition: "width 120ms linear",
        }}
      >
        <img
          src="/assets/sprites/ui/healthbar/standard-1.png"
          alt=""
          style={{
            position: "absolute",
            top: -fillY,
            left: -fillX,
            width: w,
            height: h,
            imageRendering: "pixelated",
            pointerEvents: "none",
          }}
          draggable={false}
        />
      </div>
      {/* Frame + heart on top */}
      <img
        src="/assets/sprites/ui/healthbar/standard-empty-1.png"
        alt=""
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: w,
          height: h,
          imageRendering: "pixelated",
          pointerEvents: "none",
          zIndex: 1,
        }}
        draggable={false}
      />
    </div>
  );
});
