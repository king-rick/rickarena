"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

interface Props {
  type: "health" | "stamina";
}

export const HealthBar = memo(function HealthBar({ type }: Props) {
  const current = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField(type === "health" ? "health" : "stamina")
  );
  const max = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField(type === "health" ? "maxHealth" : "maxStamina")
  );
  const burnedOut = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("burnedOut")
  );

  const pct = max > 0 ? (current / max) * 100 : 0;
  const low = pct < 25;

  let barColor: string;
  let glowColor: string;
  let iconShadow: string;
  const icon = type === "health" ? "/assets/sprites/ui/icon-heart.png" : "/assets/sprites/ui/icon-lightning.png";

  if (type === "health") {
    barColor = low ? "#ff0000" : "#ff2244";
    glowColor = low ? "rgba(255, 0, 0, 0.6)" : "rgba(255, 34, 68, 0.4)";
    iconShadow = "drop-shadow(1px 1px 0px #ff2244)";
  } else {
    if (burnedOut) {
      barColor = "#333333";
      glowColor = "rgba(51, 51, 51, 0.3)";
      iconShadow = "drop-shadow(1px 1px 0px #333333)";
    } else {
      barColor = pct > 30 ? "#22ff88" : "#ff8800";
      glowColor = pct > 30 ? "rgba(34, 255, 136, 0.4)" : "rgba(255, 136, 0, 0.4)";
      iconShadow = "drop-shadow(1px 1px 0px #22ff88)";
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Pixel art icon with accent drop shadow */}
      <img
        src={icon}
        alt=""
        style={{
          width: 36,
          height: 36,
          imageRendering: "pixelated",
          flexShrink: 0,
          filter: iconShadow,
        }}
      />
      {/* Sprite-framed bar */}
      <div
        className="relative"
        style={{
          flex: 1,
          height: 28,
          backgroundImage: "url(/assets/sprites/ui/horror/bar-frame.png)",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
          padding: "5px 6px",
        }}
      >
        {/* Inner track */}
        <div
          className="relative overflow-hidden"
          style={{
            width: "100%",
            height: "100%",
            background: "#0a0a12",
            boxShadow: low && type === "health" ? "0 0 8px rgba(255, 0, 0, 0.4)" : "none",
          }}
        >
          {/* Fill */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "100%",
              width: `${pct}%`,
              background: barColor,
              boxShadow: pct > 0 ? `0 0 10px ${glowColor}` : "none",
              transition: "width 80ms linear",
            }}
          />
          {/* Top highlight */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              height: "35%",
              width: `${pct}%`,
              background: "rgba(255, 255, 255, 0.12)",
            }}
          />
        </div>
      </div>
      {/* Numeric */}
      <span
        style={{
          fontFamily: "HorrorPixel, monospace",
          fontSize: 16,
          color: "#eeeeee",
          width: 70,
          textAlign: "right",
          flexShrink: 0,
          imageRendering: "pixelated",
        }}
      >
        {Math.ceil(current)}/{max}
      </span>
      {type === "stamina" && burnedOut && (
        <span
          style={{
            fontFamily: "HorrorPixel, monospace",
            fontSize: 12,
            color: "#ff2244",
            letterSpacing: "0.1em",
            textShadow: "0 0 4px rgba(255, 34, 68, 0.4)",
          }}
        >
          BURNED OUT
        </span>
      )}
    </div>
  );
});
