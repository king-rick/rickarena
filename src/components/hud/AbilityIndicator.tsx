"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const SIZE = 36;
const FRAMES = 8;

export const AbilityIndicator = memo(function AbilityIndicator() {
  const cooldown = useSyncExternalStore(hudState.subscribe, () => hudState.getField("abilityCooldown"));
  const maxCooldown = useSyncExternalStore(hudState.subscribe, () => hudState.getField("abilityMaxCooldown"));

  const ready = cooldown <= 0;
  const pct = maxCooldown > 0 ? Math.max(0, Math.min(1, 1 - cooldown / maxCooldown)) : 1;

  // Map cooldown progress to frame index (0 = empty, 7 = full)
  const frameIdx = ready ? FRAMES - 1 : Math.min(FRAMES - 2, Math.floor(pct * (FRAMES - 1)));

  return (
    <div
      style={{
        position: "relative",
        width: SIZE,
        height: SIZE,
        marginBottom: 20,
      }}
    >
      <img
        src={`/assets/sprites/ui/lightning/frame_${frameIdx}.png`}
        alt=""
        draggable={false}
        style={{
          width: SIZE,
          height: SIZE,
          imageRendering: "pixelated",
          filter: ready
            ? "brightness(1.3) drop-shadow(0 0 6px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 12px rgba(255, 68, 102, 0.5))"
            : "brightness(0.9)",
          animation: ready ? "lightning-pulse 1.5s ease-in-out infinite" : "none",
        }}
      />

      <style>{`
        @keyframes lightning-pulse {
          0%, 100% { filter: brightness(1.3) drop-shadow(0 0 6px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 12px rgba(255, 68, 102, 0.5)); }
          50% { filter: brightness(1.6) drop-shadow(0 0 10px rgba(255, 255, 255, 1)) drop-shadow(0 0 20px rgba(255, 68, 102, 0.8)); }
        }
      `}</style>
    </div>
  );
});
