"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const SIZE = 40;

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
        borderRadius: 4,
        border: `2px solid ${ready ? "#ff4466" : "#333344"}`,
        background: "#0a0a0a",
        overflow: "hidden",
        transition: "border-color 200ms ease",
        boxShadow: ready ? "0 0 10px rgba(255, 68, 102, 0.5), 0 0 20px rgba(255, 68, 102, 0.2)" : "none",
        animation: ready ? "ability-pulse 1.5s ease-in-out infinite" : "none",
      }}
    >
      {/* Cooldown fill (fills bottom to top) */}
      {!ready && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: `${pct * 100}%`,
            background: "linear-gradient(180deg, #ff4466 0%, #aa2244 100%)",
            opacity: 0.4,
            transition: "height 200ms linear",
          }}
        />
      )}
      {/* Ready state — full fill */}
      {ready && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(180deg, #ff4466 0%, #cc2244 100%)",
            opacity: 0.3,
          }}
        />
      )}
      {/* Cooldown seconds text (only when on cooldown) */}
      {!ready && (
        <span
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "ChainsawCarnage, HorrorPixel, monospace",
            fontSize: 16,
            color: "#555566",
          }}
        >
          {Math.ceil(cooldown)}
        </span>
      )}
      {/* Inline keyframes */}
      <style>{`
        @keyframes ability-pulse {
          0%, 100% { box-shadow: 0 0 10px rgba(255, 68, 102, 0.5), 0 0 20px rgba(255, 68, 102, 0.2); }
          50% { box-shadow: 0 0 16px rgba(255, 68, 102, 0.8), 0 0 30px rgba(255, 68, 102, 0.4); }
        }
      `}</style>
    </div>
  );
});
