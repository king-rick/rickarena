"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const BAR_W = 200;
const BAR_H = 39;
// Fill region inside the tube (between metal caps, behind glass)
const FILL_LEFT = 33;
const FILL_TOP = 11;
const FILL_H = 17;
const FILL_MAX_W = BAR_W - 66;

export const HealthBar = memo(function HealthBar() {
  const health = useSyncExternalStore(hudState.subscribe, () => hudState.getField("health"));
  const maxHealth = useSyncExternalStore(hudState.subscribe, () => hudState.getField("maxHealth"));

  const pct = maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;
  const low = pct < 0.25;
  const fillWidth = Math.round(FILL_MAX_W * pct);

  return (
    <div style={{ position: "relative", width: BAR_W, height: BAR_H }}>
      <img
        src="/assets/sprites/ui/healthbar/tube.png"
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
          background: "linear-gradient(180deg, #cc2222 0%, #991111 30%, #770000 60%, #550000 100%)",
          boxShadow: "inset 0 -2px 4px rgba(200, 50, 50, 0.5), inset 0 2px 3px rgba(255, 100, 100, 0.25), 0 0 8px rgba(180, 0, 0, 0.4)",
          transition: "width 300ms ease-out",
          overflow: "hidden",
        }}>
          {/* Slow-moving caustic blobs */}
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse 30% 80% at 20% 50%, rgba(255,80,80,0.3) 0%, transparent 70%), radial-gradient(ellipse 25% 90% at 60% 40%, rgba(255,60,60,0.25) 0%, transparent 70%), radial-gradient(ellipse 35% 70% at 85% 60%, rgba(255,100,80,0.2) 0%, transparent 70%)",
            animation: "hp-blobs 4s ease-in-out infinite",
          }} />
        </div>
      )}
      {low && pct > 0 && (
        <div style={{
          position: "absolute", inset: 0,
          boxShadow: "0 0 8px rgba(255, 0, 0, 0.6), inset 0 0 4px rgba(255, 0, 0, 0.3)",
          pointerEvents: "none",
          borderRadius: 4,
          animation: "low-hp-pulse 1s ease-in-out infinite",
        }} />
      )}
      <style>{`
        @keyframes hp-blobs {
          0%, 100% { transform: translateX(0%); filter: brightness(1.0); }
          33% { transform: translateX(8%); filter: brightness(1.1); }
          66% { transform: translateX(-5%); filter: brightness(0.95); }
        }
        @keyframes low-hp-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
});
