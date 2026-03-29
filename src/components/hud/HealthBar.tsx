"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";
const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

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
  const isHealth = type === "health";

  // Use different bar frame images for health vs stamina
  const frameImg = isHealth
    ? "/assets/sprites/ui/horror/healthbar-c-full.png"
    : "/assets/sprites/ui/horror/healthbar-l.png";

  let barColor: string;
  let barGlow: string;
  if (isHealth) {
    barColor = low ? "#ff0033" : "#cc1133";
    barGlow = low ? "0 0 8px rgba(255, 0, 0, 0.6)" : "none";
  } else if (burnedOut) {
    barColor = "#222230";
    barGlow = "none";
  } else {
    barColor = pct > 30 ? "#1188cc" : "#cc8800";
    barGlow = "none";
  }

  const labelColor = type === "stamina" && burnedOut ? "#444444" : "#888899";
  const valueColor = type === "stamina" && burnedOut ? "#555555" : "#cccccc";
  const label = isHealth ? "HP" : "ST";

  return (
    <div className="flex items-center gap-2">
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 13,
          color: labelColor,
          width: 20,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: 18,
          position: "relative",
          overflow: "hidden",
          boxShadow: barGlow,
        }}
      >
        {/* Frame image as background */}
        <img
          src={frameImg}
          alt=""
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "fill",
            imageRendering: "pixelated",
            zIndex: 2,
            pointerEvents: "none",
          }}
        />
        {/* Dark track behind the fill */}
        <div
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            right: 2,
            bottom: 2,
            background: "#0a0a12",
            zIndex: 0,
          }}
        />
        {/* Colored fill bar */}
        <div
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            bottom: 2,
            width: `calc(${pct}% - 4px)`,
            background: barColor,
            transition: "width 80ms linear",
            zIndex: 1,
          }}
        />
        {/* Highlight strip on top of fill */}
        <div
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            height: "35%",
            width: `calc(${pct}% - 4px)`,
            background: "rgba(255, 255, 255, 0.12)",
            zIndex: 1,
          }}
        />
      </div>
      <span
        style={{
          fontFamily: BODY,
          fontSize: 12,
          color: valueColor,
          width: 58,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {Math.ceil(current)}/{max}
      </span>
      {type === "stamina" && burnedOut && (
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: 10,
            color: "#ff2244",
            letterSpacing: "0.05em",
            textShadow: "0 0 4px rgba(255, 34, 68, 0.5)",
          }}
        >
          BURNED OUT
        </span>
      )}
    </div>
  );
});
