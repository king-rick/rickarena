"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";
const FRAMES = 8;

const WEAPON_ICONS: Record<string, string> = {
  pistol: "/assets/sprites/items/pistol.png",
  shotgun: "/assets/sprites/items/shotgun.png",
  smg: "/assets/sprites/items/smg.png",
  assault_rifle: "/assets/sprites/items/assault-rifle.png",
  rpg: "/assets/sprites/items/rpg.png",
};

function getActiveIcon(activeItemType: string | null, equippedWeapon: string | null): string | null {
  if (activeItemType === "weapon" && equippedWeapon) return WEAPON_ICONS[equippedWeapon] ?? null;
  return null;
}

export const Hotbar = memo(function Hotbar() {
  const equippedWeapon = useSyncExternalStore(hudState.subscribe, () => hudState.getField("equippedWeapon"));
  const ammo = useSyncExternalStore(hudState.subscribe, () => hudState.getField("ammo"));
  const reserveAmmo = useSyncExternalStore(hudState.subscribe, () => hudState.getField("reserveAmmo"));
  const reloading = useSyncExternalStore(hudState.subscribe, () => hudState.getField("reloading"));
  const activeItemType = useSyncExternalStore(hudState.subscribe, () => hudState.getField("activeItemType"));
  const abilityCooldown = useSyncExternalStore(hudState.subscribe, () => hudState.getField("abilityCooldown"));
  const abilityMaxCooldown = useSyncExternalStore(hudState.subscribe, () => hudState.getField("abilityMaxCooldown"));
  const flashlightOn = useSyncExternalStore(hudState.subscribe, () => hudState.getField("flashlightOn"));

  const icon = getActiveIcon(activeItemType, equippedWeapon);

  // Ammo / count
  let countText = "";
  let danger = false;
  if (activeItemType === "weapon" && icon) {
    if (reloading) { countText = "RLD"; danger = true; }
    else { countText = `${ammo}/${reserveAmmo}`; danger = ammo === 0 && reserveAmmo === 0; }
  }

  // Ability
  const abilityReady = abilityCooldown <= 0;
  const abilityPct = abilityMaxCooldown > 0 ? Math.max(0, Math.min(1, 1 - abilityCooldown / abilityMaxCooldown)) : 1;
  const abilityFrame = abilityReady ? FRAMES - 1 : Math.min(FRAMES - 2, Math.floor(abilityPct * (FRAMES - 1)));

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      padding: "2px 6px",
      gap: 6,
      background: "linear-gradient(180deg, rgba(8, 4, 12, 0.6) 0%, rgba(16, 8, 16, 0.65) 100%)",
      border: "1px solid rgba(255, 34, 68, 0.25)",
      borderRadius: 3,
      boxShadow: "0 0 8px rgba(0, 0, 0, 0.6), 0 0 4px rgba(255, 34, 68, 0.1)",
    }}>
      {/* Weapon + ammo */}
      {icon && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img
              src={icon}
              alt=""
              style={{
                width: 44,
                height: 44,
                imageRendering: "pixelated",
                filter: "drop-shadow(0 0 3px rgba(255, 34, 68, 0.3))",
              }}
              draggable={false}
            />
            {countText && (
              <span style={{
                fontFamily: DISPLAY,
                fontSize: 18,
                color: danger ? "#ff3333" : "#e8e0e0",
                textShadow: danger
                  ? "0 0 6px rgba(255, 0, 0, 0.5)"
                  : "0 0 4px rgba(255, 34, 68, 0.3)",
                letterSpacing: 1,
              }}>
                {countText}
              </span>
            )}
          </div>
          <div style={{ width: 1, alignSelf: "stretch", background: "linear-gradient(180deg, transparent, rgba(255, 34, 68, 0.3), transparent)" }} />
        </>
      )}

      {/* Ability */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <img
          src={`/assets/sprites/ui/lightning/frame_${abilityFrame}.png`}
          alt=""
          draggable={false}
          style={{
            width: 34,
            height: 34,
            imageRendering: "pixelated",
            filter: abilityReady
              ? "brightness(1.3) drop-shadow(0 0 4px rgba(255, 255, 255, 0.7)) drop-shadow(0 0 8px rgba(255, 68, 102, 0.4))"
              : "brightness(0.7)",
            animation: abilityReady ? "lightning-pulse 1.5s ease-in-out infinite" : "none",
          }}
        />
        <span style={{
          fontFamily: DISPLAY,
          fontSize: 13,
          color: abilityReady ? "#ffffff" : "#666666",
          textShadow: abilityReady ? "0 0 4px rgba(255, 68, 102, 0.4)" : "none",
          letterSpacing: 1,
        }}>
          Q
        </span>
      </div>

      {/* Divider */}
      <div style={{ width: 1, alignSelf: "stretch", background: "linear-gradient(180deg, transparent, rgba(255, 34, 68, 0.3), transparent)" }} />

      {/* Flashlight toggle */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <svg width="28" height="28" viewBox="0 0 28 28" style={{
          filter: flashlightOn
            ? "drop-shadow(0 0 4px rgba(255, 224, 138, 0.8)) drop-shadow(0 0 8px rgba(255, 200, 80, 0.4))"
            : "none",
          transition: "filter 150ms ease",
        }}>
          {/* Flashlight body — horizontal, pointing right */}
          <rect x="4" y="10" width="12" height="8" rx="1" fill={flashlightOn ? "#ccb866" : "#555"} />
          {/* Lens head */}
          <rect x="15" y="8" width="4" height="12" rx="1" fill={flashlightOn ? "#ffe08a" : "#666"} />
          {/* Beam cone when on */}
          {flashlightOn && (
            <polygon points="19,9 28,4 28,24 19,19" fill="rgba(255, 224, 138, 0.35)" />
          )}
          {/* Button detail */}
          <rect x="8" y="10" width="3" height="2" rx="0.5" fill={flashlightOn ? "#aa9944" : "#444"} />
        </svg>
        <span style={{
          fontFamily: DISPLAY,
          fontSize: 13,
          color: flashlightOn ? "#ffe08a" : "#555",
          textShadow: flashlightOn ? "0 0 4px rgba(255, 224, 138, 0.5)" : "none",
          letterSpacing: 1,
          transition: "color 150ms ease",
        }}>
          F
        </span>
      </div>

      <style>{`
        @keyframes lightning-pulse {
          0%, 100% { filter: brightness(1.3) drop-shadow(0 0 4px rgba(255, 255, 255, 0.7)) drop-shadow(0 0 8px rgba(255, 68, 102, 0.4)); }
          50% { filter: brightness(1.6) drop-shadow(0 0 8px rgba(255, 255, 255, 1)) drop-shadow(0 0 14px rgba(255, 68, 102, 0.7)); }
        }
      `}</style>
    </div>
  );
});
