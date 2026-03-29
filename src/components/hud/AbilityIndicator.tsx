"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";
const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

export const AbilityIndicator = memo(function AbilityIndicator() {
  const name = useSyncExternalStore(hudState.subscribe, () => hudState.getField("abilityName"));
  const cooldown = useSyncExternalStore(hudState.subscribe, () => hudState.getField("abilityCooldown"));
  const keyBind = useSyncExternalStore(hudState.subscribe, () => hudState.getField("abilityKey"));

  const ready = cooldown <= 0;

  return (
    <div
      className="flex items-center gap-4"
      style={{
        backgroundImage: "url(/assets/sprites/ui/horror/panel-frame.png)",
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
        padding: "10px 18px",
      }}
    >
      <span
        style={{
          fontFamily: BODY,
          fontSize: 18,
          color: ready ? "#ff4466" : "#444455",
          textShadow: ready ? "0 0 6px rgba(255, 68, 102, 0.4)" : "none",
        }}
      >
        [{keyBind}]
      </span>
      <span
        style={{
          fontFamily: BODY,
          fontSize: 18,
          color: ready ? "#eeeeee" : "#555566",
        }}
      >
        {name}
      </span>
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 20,
          color: ready ? "#ff4466" : "#555566",
          textShadow: ready ? "0 0 8px rgba(255, 68, 102, 0.4)" : "none",
        }}
      >
        {ready ? "READY" : `${Math.ceil(cooldown)}s`}
      </span>
    </div>
  );
});
