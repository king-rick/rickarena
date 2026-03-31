"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const BAR_W = 200;
const BAR_H = 39;
const FILL_LEFT = 33;
const FILL_TOP = 11;
const FILL_H = 17;
const FILL_MAX_W = BAR_W - 66;

export const StaminaBar = memo(function StaminaBar() {
  const stamina = useSyncExternalStore(hudState.subscribe, () => hudState.getField("stamina"));
  const maxStamina = useSyncExternalStore(hudState.subscribe, () => hudState.getField("maxStamina"));
  const burnedOut = useSyncExternalStore(hudState.subscribe, () => hudState.getField("burnedOut"));

  const pct = maxStamina > 0 ? Math.max(0, Math.min(1, stamina / maxStamina)) : 0;
  const fillWidth = Math.round(FILL_MAX_W * pct);

  return (
    <div style={{
      position: "relative", width: BAR_W, height: BAR_H,
      opacity: burnedOut ? 0.4 : 1,
      transition: "opacity 200ms ease",
    }}>
      <img
        src="/assets/sprites/ui/staminabar/tube.png"
        width={BAR_W}
        height={BAR_H}
        alt=""
        draggable={false}
        style={{ display: "block" }}
      />
      {pct > 0 && (
        <div style={{
          position: "absolute",
          top: FILL_TOP,
          left: FILL_LEFT,
          width: fillWidth,
          height: FILL_H,
          borderRadius: 2,
          background: "linear-gradient(180deg, #22aa22 0%, #117711 30%, #005500 60%, #003300 100%)",
          boxShadow: "inset 0 -2px 4px rgba(50, 200, 50, 0.5), inset 0 2px 3px rgba(100, 255, 100, 0.25), 0 0 8px rgba(0, 180, 0, 0.4)",
          transition: "width 300ms ease-out",
          overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse 30% 80% at 20% 50%, rgba(80,255,80,0.3) 0%, transparent 70%), radial-gradient(ellipse 25% 90% at 60% 40%, rgba(60,255,60,0.25) 0%, transparent 70%), radial-gradient(ellipse 35% 70% at 85% 60%, rgba(80,255,100,0.2) 0%, transparent 70%)",
            animation: "sp-blobs 4.3s ease-in-out infinite",
          }} />
        </div>
      )}
      {burnedOut && (
        <span style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)", zIndex: 2,
          fontFamily: "ChainsawCarnage, HorrorPixel, monospace",
          fontSize: 10,
          color: "#ff2244",
          textShadow: "0 0 4px rgba(255, 34, 68, 0.5)",
          letterSpacing: "0.05em",
          pointerEvents: "none",
        }}>
          BURNED OUT
        </span>
      )}
      <style>{`
        @keyframes sp-blobs {
          0%, 100% { transform: translateX(0%); filter: brightness(1.0); }
          33% { transform: translateX(8%); filter: brightness(1.1); }
          66% { transform: translateX(-5%); filter: brightness(0.95); }
        }
      `}</style>
    </div>
  );
});
