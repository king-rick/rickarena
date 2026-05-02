"use client";

import { useSyncExternalStore, useCallback } from "react";
import { hudState } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";

export function AxePickup() {
  const active = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("axePickupActive")
  );

  const dismiss = useCallback(() => {
    hudState.dispatchGameAction("dismissAxePickup");
  }, []);

  if (!active) return null;

  return (
    <div
      onClick={dismiss}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0, 0, 0, 0.75)",
        cursor: "pointer",
        pointerEvents: "auto",
        animation: "fadeIn 200ms ease-out",
      }}
    >
      {/* Axe icon */}
      <img
        src="/assets/sprites/items/axe.png"
        alt="Axe"
        style={{
          width: 64,
          height: 64,
          imageRendering: "pixelated",
          marginBottom: 16,
          filter: "drop-shadow(0 0 8px rgba(255, 200, 100, 0.4))",
        }}
      />

      {/* Message */}
      <div style={{
        fontFamily: BODY,
        fontSize: 20,
        color: "#e0e0e0",
        textAlign: "center",
        lineHeight: 1.6,
        textShadow: "0 2px 4px rgba(0,0,0,0.9)",
      }}>
        You found an axe!
        <br />
        <span style={{ fontSize: 16, color: "#aaaaaa" }}>
          Use it to chop down fences.
        </span>
      </div>

      {/* Dismiss hint */}
      <div style={{
        fontFamily: BODY,
        fontSize: 12,
        color: "#666666",
        marginTop: 24,
        letterSpacing: 2,
      }}>
        [ SPACE ]
      </div>
    </div>
  );
}
