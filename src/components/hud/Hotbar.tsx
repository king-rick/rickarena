"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";

const ITEM_ICONS: Record<string, string> = {
  pistol: "/assets/sprites/items/pistol.png",
  shotgun: "/assets/sprites/items/shotgun.png",
  smg: "/assets/sprites/items/smg.png",
  barricade: "/assets/sprites/items/trap-barricade.png",
  landmine: "/assets/sprites/items/trap-landmine.png",
};

function getActiveIcon(activeSlot: number, equippedWeapon: string | null): { icon: string | null; label: string } {
  if ((activeSlot === 1 || activeSlot === 2) && equippedWeapon) return { icon: ITEM_ICONS[equippedWeapon] ?? null, label: equippedWeapon.toUpperCase() };
  if (activeSlot === 3) return { icon: ITEM_ICONS.barricade, label: "BARRICADE" };
  if (activeSlot === 4) return { icon: ITEM_ICONS.landmine, label: "LANDMINE" };
  return { icon: null, label: "" };
}

function getActiveCount(activeSlot: number, ammo: number, maxAmmo: number, reserveAmmo: number, reloading: boolean, barricadeCount: number, mineCount: number): { count: string; danger: boolean } {
  if (activeSlot === 1 || activeSlot === 2) {
    if (reloading) return { count: "RELOADING", danger: true };
    return { count: `${ammo}/${reserveAmmo}`, danger: ammo === 0 && reserveAmmo === 0 };
  }
  if (activeSlot === 3) return { count: `x${barricadeCount}`, danger: false };
  if (activeSlot === 4) return { count: `x${mineCount}`, danger: false };
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

  const { icon, label } = getActiveIcon(activeSlot, equippedWeapon);
  const { count, danger } = getActiveCount(activeSlot, ammo, maxAmmo, reserveAmmo, reloading, barricadeCount, mineCount);

  // Nothing equipped — don't render
  if (!icon) return null;

  return (
    <div className="relative flex flex-col items-center">
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
  );
});
