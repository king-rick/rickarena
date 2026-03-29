"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

interface SlotInfo {
  slotIndex: number;
  label: string;
  key: string;
  count: string;
  countDanger: boolean;
}

export const Hotbar = memo(function Hotbar() {
  const activeSlot = useSyncExternalStore(hudState.subscribe, () => hudState.getField("activeSlot"));
  const equippedWeapon = useSyncExternalStore(hudState.subscribe, () => hudState.getField("equippedWeapon"));
  const ammo = useSyncExternalStore(hudState.subscribe, () => hudState.getField("ammo"));
  const maxAmmo = useSyncExternalStore(hudState.subscribe, () => hudState.getField("maxAmmo"));
  const barricadeCount = useSyncExternalStore(hudState.subscribe, () => hudState.getField("barricadeCount"));
  const mineCount = useSyncExternalStore(hudState.subscribe, () => hudState.getField("mineCount"));

  // Only show slots for items the player actually has
  const slots: SlotInfo[] = [];

  if (equippedWeapon) {
    slots.push({
      slotIndex: 1,
      label: equippedWeapon.toUpperCase(),
      key: "2",
      count: `${ammo}/${maxAmmo}`,
      countDanger: ammo === 0,
    });
  }
  if (barricadeCount > 0) {
    slots.push({
      slotIndex: 2,
      label: "BARR",
      key: "3",
      count: `x${barricadeCount}`,
      countDanger: false,
    });
  }
  if (mineCount > 0) {
    slots.push({
      slotIndex: 3,
      label: "MINE",
      key: "4",
      count: `x${mineCount}`,
      countDanger: false,
    });
  }

  // Nothing in inventory, don't render hotbar
  if (slots.length === 0) return null;

  return (
    <div className="flex" style={{ gap: 5 }}>
      {slots.map((slot) => {
        const active = activeSlot === slot.slotIndex;
        const slotBg = active
          ? "/assets/sprites/ui/horror/slot-active.png"
          : "/assets/sprites/ui/horror/slot-inactive.png";

        return (
          <div
            key={slot.slotIndex}
            className="relative flex flex-col items-center justify-center"
            style={{
              width: 72,
              height: 72,
              backgroundImage: `url(${slotBg})`,
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
              boxShadow: active ? "0 0 12px rgba(255, 34, 68, 0.35)" : "none",
            }}
          >
            {/* Key number */}
            <span
              className="absolute"
              style={{
                top: 4,
                left: 6,
                fontSize: 11,
                fontFamily: "HorrorPixel, monospace",
                color: active ? "#ff4466" : "#444455",
              }}
            >
              {slot.key}
            </span>
            {/* Slot label */}
            <span
              style={{
                fontFamily: "HorrorPixel, monospace",
                fontSize: 11,
                marginTop: 8,
                color: active ? "#eeeeee" : "#667788",
              }}
            >
              {slot.label}
            </span>
            {/* Count */}
            {slot.count && (
              <span
                style={{
                  fontFamily: "HorrorPixel, monospace",
                  fontSize: 11,
                  color: slot.countDanger ? "#ff0000" : "#ffcc00",
                  textShadow: slot.countDanger ? "0 0 4px rgba(255, 0, 0, 0.4)" : "none",
                }}
              >
                {slot.count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
});
