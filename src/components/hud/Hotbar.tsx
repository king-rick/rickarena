"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";

const ITEM_ICONS: Record<string, string> = {
  pistol: "/assets/sprites/items/pistol.png",
  shotgun: "/assets/sprites/items/shotgun.png",
  smg: "/assets/sprites/items/smg.png",
  assault_rifle: "/assets/sprites/items/assault-rifle.png",
  rpg: "/assets/sprites/items/rpg.png",
  barricade: "/assets/sprites/items/trap-barricade.png",
  landmine: "/assets/sprites/items/trap-landmine.png",
};

function getActiveIcon(activeItemType: string | null, equippedWeapon: string | null): { icon: string | null; label: string } {
  if (activeItemType === "weapon" && equippedWeapon) return { icon: ITEM_ICONS[equippedWeapon] ?? null, label: equippedWeapon.toUpperCase() };
  if (activeItemType === "barricade") return { icon: ITEM_ICONS.barricade, label: "BARRICADE" };
  if (activeItemType === "mine") return { icon: ITEM_ICONS.landmine, label: "LANDMINE" };
  return { icon: null, label: "" };
}

function getActiveCount(activeItemType: string | null, ammo: number, maxAmmo: number, reserveAmmo: number, reloading: boolean, barricadeCount: number, mineCount: number): { count: string; danger: boolean } {
  if (activeItemType === "weapon") {
    if (reloading) return { count: "RELOADING", danger: true };
    return { count: `${ammo}/${reserveAmmo}`, danger: ammo === 0 && reserveAmmo === 0 };
  }
  if (activeItemType === "barricade") return { count: `x${barricadeCount}`, danger: false };
  if (activeItemType === "mine") return { count: `x${mineCount}`, danger: false };
  return { count: "", danger: false };
}

export const Hotbar = memo(function Hotbar() {
  const activeSlot = useSyncExternalStore(hudState.subscribe, () => hudState.getField("activeSlot"));
  const equippedWeapon = useSyncExternalStore(hudState.subscribe, () => hudState.getField("equippedWeapon"));
  const ammo = useSyncExternalStore(hudState.subscribe, () => hudState.getField("ammo"));
  const maxAmmo = useSyncExternalStore(hudState.subscribe, () => hudState.getField("maxAmmo"));
  const reserveAmmo = useSyncExternalStore(hudState.subscribe, () => hudState.getField("reserveAmmo"));
  const reloading = useSyncExternalStore(hudState.subscribe, () => hudState.getField("reloading"));
  const barricadeCount = useSyncExternalStore(hudState.subscribe, () => hudState.getField("barricadeCount"));
  const mineCount = useSyncExternalStore(hudState.subscribe, () => hudState.getField("mineCount"));
  const grenadeCount = useSyncExternalStore(hudState.subscribe, () => hudState.getField("grenadeCount"));

  const activeItemType = useSyncExternalStore(hudState.subscribe, () => hudState.getField("activeItemType"));
  const { icon, label } = getActiveIcon(activeItemType, equippedWeapon);
  const { count, danger } = getActiveCount(activeItemType, ammo, maxAmmo, reserveAmmo, reloading, barricadeCount, mineCount);

  // Nothing equipped — don't render
  if (!icon) return null;

  return (
    <div className="relative flex items-end gap-3">
      <div className="flex flex-col items-center">
        {/* Item icon */}
        <img
          src={icon}
          alt={label}
          style={{
            width: 64,
            height: 64,
            imageRendering: "pixelated",
            filter: "drop-shadow(0 0 6px rgba(255, 34, 68, 0.5)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8))",
          }}
          draggable={false}
        />

        {/* Ammo / count */}
        {count && (
          <span
            style={{
              marginTop: 2,
              fontSize: 16,
              fontWeight: 700,
              fontFamily: BODY,
              color: danger ? "#ff0000" : "#ffffff",
              textShadow: danger
                ? "0 0 6px rgba(255, 0, 0, 0.5)"
                : "0 0 6px rgba(255, 34, 68, 0.4), 0 1px 2px rgba(0, 0, 0, 0.9)",
            }}
          >
            {count}
          </span>
        )}
      </div>

      {/* Grenade counter */}
      {grenadeCount > 0 && (
        <div className="flex flex-col items-center" style={{ opacity: 0.85 }}>
          <img
            src="/assets/sprites/items/grenade.png"
            alt="Grenade"
            style={{
              width: 32,
              height: 32,
              imageRendering: "pixelated",
              filter: "drop-shadow(0 0 4px rgba(255, 150, 0, 0.5)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.8))",
            }}
            draggable={false}
          />
          <span
            style={{
              marginTop: 1,
              fontSize: 12,
              fontWeight: 700,
              fontFamily: BODY,
              color: "#ffffff",
              textShadow: "0 0 4px rgba(255, 150, 0, 0.4), 0 1px 2px rgba(0, 0, 0, 0.9)",
            }}
          >
            G x{grenadeCount}
          </span>
        </div>
      )}
    </div>
  );
});
