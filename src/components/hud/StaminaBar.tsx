"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const BAR_W = 200;
const BAR_H = 24;

export const StaminaBar = memo(function StaminaBar() {
  const stamina = useSyncExternalStore(hudState.subscribe, () => hudState.getField("stamina"));
  const maxStamina = useSyncExternalStore(hudState.subscribe, () => hudState.getField("maxStamina"));
  const burnedOut = useSyncExternalStore(hudState.subscribe, () => hudState.getField("burnedOut"));

  const pct = maxStamina > 0 ? Math.max(0, Math.min(1, stamina / maxStamina)) : 0;

  return (
    <div style={{
      position: "relative", width: BAR_W, height: BAR_H,
      opacity: burnedOut ? 0.4 : 1,
      transition: "opacity 200ms ease",
    }}>
      {/* Green bar clipped by stamina % */}
      <div style={{
        position: "absolute", top: 0, left: 0,
        width: BAR_W * pct, height: BAR_H,
        overflow: "hidden",
        transition: "width 80ms linear",
      }}>
        <img
          src="/assets/sprites/ui/healthbar-full-green.png"
          alt=""
          style={{ width: BAR_W, height: BAR_H, imageRendering: "pixelated" }}
          draggable={false}
        />
      </div>
      {/* Burned out label */}
      {burnedOut && (
        <span style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          fontFamily: "ChainsawCarnage, HorrorPixel, monospace",
          fontSize: 10,
          color: "#ff2244",
          textShadow: "0 0 4px rgba(255, 34, 68, 0.5)",
          letterSpacing: "0.05em",
          pointerEvents: "none",
        }}>
          BURNED OUT
        </span>
      )}
    </div>
  );
});
