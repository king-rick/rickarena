"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

export const TopStats = memo(function TopStats() {
  const kills = useSyncExternalStore(hudState.subscribe, () => hudState.getField("kills"));
  const currency = useSyncExternalStore(hudState.subscribe, () => hudState.getField("currency"));
  const level = useSyncExternalStore(hudState.subscribe, () => hudState.getField("level"));

  return (
    <div className="flex items-center gap-6">
      {/* Level */}
      <div className="flex items-center gap-1.5">
        <span
          style={{
            fontFamily: "HorrorPixel, monospace",
            fontSize: 14,
            color: "#556677",
            letterSpacing: "0.05em",
          }}
        >
          LV
        </span>
        <span
          style={{
            fontFamily: "HorrorPixel, monospace",
            fontSize: 22,
            color: "#ff8800",
            textShadow: "0 0 8px rgba(255, 136, 0, 0.3)",
          }}
        >
          {level}
        </span>
      </div>
      {/* Kills */}
      <div className="flex items-center gap-1.5">
        <img
          src="/assets/sprites/ui/icon-skull.png"
          alt=""
          style={{
            width: 36,
            height: 36,
            imageRendering: "pixelated",
            filter: "drop-shadow(1px 1px 0px #ff4466)",
          }}
        />
        <span
          style={{
            fontFamily: "HorrorPixel, monospace",
            fontSize: 22,
            color: "#eeeeee",
          }}
        >
          {kills}
        </span>
      </div>
      {/* Currency */}
      <div className="flex items-center gap-1.5">
        <img
          src="/assets/sprites/ui/icon-coin.png"
          alt=""
          style={{
            width: 36,
            height: 36,
            imageRendering: "pixelated",
            filter: "drop-shadow(1px 1px 0px #ffcc00)",
          }}
        />
        <span
          style={{
            fontFamily: "HorrorPixel, monospace",
            fontSize: 22,
            color: "#ffcc00",
            textShadow: "0 0 6px rgba(255, 204, 0, 0.25)",
          }}
        >
          {currency}
        </span>
      </div>
    </div>
  );
});
