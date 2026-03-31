"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const SIZE = 32;

export const AbilityIndicator = memo(function AbilityIndicator() {
  const cooldown = useSyncExternalStore(hudState.subscribe, () => hudState.getField("abilityCooldown"));
  const maxCooldown = useSyncExternalStore(hudState.subscribe, () => hudState.getField("abilityMaxCooldown"));

  const ready = cooldown <= 0;
  const pct = maxCooldown > 0 ? Math.max(0, Math.min(1, 1 - cooldown / maxCooldown)) : 1;

  return (
    <div
      style={{
        position: "relative",
        width: SIZE,
        height: SIZE,
        marginBottom: 22,
      }}
    >
      {/* Dark hourglass (background — always visible, dimmed) */}
      <img
        src="/assets/sprites/ui/hourglass.png"
        alt=""
        draggable={false}
        style={{
          position: "absolute",
          width: SIZE,
          height: SIZE,
          imageRendering: "pixelated",
          opacity: ready ? 0 : 0.15,
          filter: "brightness(0.4)",
        }}
      />

      {/* Filling hourglass — clipped from bottom up during cooldown */}
      {!ready && (
        <div
          style={{
            position: "absolute",
            width: SIZE,
            height: SIZE,
            clipPath: `inset(${(1 - pct) * 100}% 0 0 0)`,
            transition: "clip-path 200ms linear",
          }}
        >
          <img
            src="/assets/sprites/ui/hourglass.png"
            alt=""
            draggable={false}
            style={{
              width: SIZE,
              height: SIZE,
              imageRendering: "pixelated",
              opacity: 0.6,
              filter: "brightness(0.7)",
            }}
          />
        </div>
      )}

      {/* Ready state — fully lit hourglass with glow */}
      {ready && (
        <img
          src="/assets/sprites/ui/hourglass.png"
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            width: SIZE,
            height: SIZE,
            imageRendering: "pixelated",
            filter: "brightness(1.4) drop-shadow(0 0 8px rgba(255, 68, 102, 0.9)) drop-shadow(0 0 16px rgba(255, 68, 102, 0.5))",
            animation: "hourglass-glow 1.5s ease-in-out infinite",
          }}
        />
      )}

      {/* Cooldown seconds */}
      {!ready && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "ChainsawCarnage, HorrorPixel, monospace",
            fontSize: 14,
            color: "#aa3355",
            textShadow: "0 0 4px rgba(0, 0, 0, 0.9)",
            pointerEvents: "none",
          }}
        >
          {Math.ceil(cooldown)}
        </span>
      )}

      <style>{`
        @keyframes hourglass-glow {
          0%, 100% { filter: brightness(1.4) drop-shadow(0 0 8px rgba(255, 68, 102, 0.9)) drop-shadow(0 0 16px rgba(255, 68, 102, 0.5)); }
          50% { filter: brightness(1.8) drop-shadow(0 0 14px rgba(255, 68, 102, 1)) drop-shadow(0 0 24px rgba(255, 68, 102, 0.7)); }
        }
      `}</style>
    </div>
  );
});
