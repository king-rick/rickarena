"use client";

import { useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

export function InteractionPrompt() {
  const prompt = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("interactionPrompt")
  );

  if (!prompt) return null;

  const affordable = prompt.canAfford;
  const accentColor = affordable ? "rgba(255, 34, 68, 0.35)" : "rgba(255, 60, 60, 0.5)";

  return (
    <div
      style={{
        position: "absolute",
        left: `${prompt.screenX}%`,
        top: `${prompt.screenY}%`,
        transform: "translate(-50%, -100%)",
        display: "flex",
        alignItems: "center",
        gap: 8,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        padding: "4px 12px 4px 10px",
        background: "linear-gradient(180deg, rgba(8, 4, 12, 0.6) 0%, rgba(16, 8, 16, 0.65) 100%)",
        border: `1px solid ${accentColor}`,
        borderRadius: 2,
        boxShadow: `0 0 12px rgba(0, 0, 0, 0.8), inset 0 0 8px rgba(0, 0, 0, 0.4), 0 0 6px ${accentColor}`,
        animation: "fadeIn 150ms ease-out",
      }}
    >
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 13,
          fontWeight: "bold",
          color: affordable ? "#e8e0e0" : "#ff5555",
          textShadow: affordable
            ? "0 0 6px rgba(255, 34, 68, 0.3), 0 1px 2px rgba(0,0,0,0.9)"
            : "0 0 6px rgba(255, 60, 60, 0.4), 0 1px 2px rgba(0,0,0,0.9)",
          letterSpacing: 1.5,
          textTransform: "uppercase",
        }}
      >
        {prompt.label}
      </span>
      {prompt.keyHint && (
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: 10,
            fontWeight: "bold",
            color: "#ffffff",
            textShadow: "0 0 4px rgba(255, 34, 68, 0.5)",
            background: "rgba(255, 34, 68, 0.2)",
            border: "1px solid rgba(255, 34, 68, 0.4)",
            borderRadius: 2,
            padding: "1px 5px",
            lineHeight: 1.2,
            letterSpacing: 1,
          }}
        >
          {prompt.keyHint}
        </span>
      )}
    </div>
  );
}
