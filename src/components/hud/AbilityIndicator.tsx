"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

export const AbilityIndicator = memo(function AbilityIndicator() {
  const name = useSyncExternalStore(hudState.subscribe, () => hudState.getField("abilityName"));
  const cooldown = useSyncExternalStore(hudState.subscribe, () => hudState.getField("abilityCooldown"));
  const keyBind = useSyncExternalStore(hudState.subscribe, () => hudState.getField("abilityKey"));

  const ready = cooldown <= 0;

  return (
    <div
      className="flex items-center gap-3"
      style={{
        backgroundImage: "url(/assets/sprites/ui/horror/panel-frame.png)",
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
        padding: "8px 14px",
      }}
    >
      {/* Key badge */}
      <span
        style={{
          fontFamily: "HorrorPixel, monospace",
          fontSize: 14,
          color: ready ? "#ff4466" : "#333344",
          textShadow: ready ? "0 0 6px rgba(255, 68, 102, 0.4)" : "none",
        }}
      >
        [{keyBind}]
      </span>
      <span
        style={{
          fontFamily: "HorrorPixel, monospace",
          fontSize: 13,
          color: ready ? "#eeeeee" : "#444455",
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontFamily: "HorrorPixel, monospace",
          fontSize: 13,
          color: ready ? "#ff4466" : "#444455",
          textShadow: ready ? "0 0 8px rgba(255, 68, 102, 0.4)" : "none",
        }}
      >
        {ready ? "READY" : `${Math.ceil(cooldown)}s`}
      </span>
    </div>
  );
});
