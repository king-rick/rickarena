"use client";

import type { HUDData } from "@/game/HUDState";

interface HotbarProps {
  data: HUDData;
}

interface SlotDef {
  label: string;
  key: string;
  getCount: (d: HUDData) => string;
  isAvailable: (d: HUDData) => boolean;
}

const SLOTS: SlotDef[] = [
  {
    label: "FISTS",
    key: "1",
    getCount: () => "",
    isAvailable: () => true,
  },
  {
    label: "WEAPON",
    key: "2",
    getCount: (d) => d.equippedWeapon ? `${d.ammo}/${d.maxAmmo}` : "",
    isAvailable: (d) => !!d.equippedWeapon,
  },
  {
    label: "BARR",
    key: "3",
    getCount: (d) => d.barricadeCount > 0 ? `x${d.barricadeCount}` : "",
    isAvailable: (d) => d.barricadeCount > 0,
  },
  {
    label: "MINE",
    key: "4",
    getCount: (d) => d.mineCount > 0 ? `x${d.mineCount}` : "",
    isAvailable: (d) => d.mineCount > 0,
  },
];

export function Hotbar({ data }: HotbarProps) {
  return (
    <div className="flex gap-1.5">
      {SLOTS.map((slot, i) => {
        const active = data.activeSlot === i;
        const available = slot.isAvailable(data);
        const count = slot.getCount(data);

        return (
          <div
            key={i}
            className="relative flex flex-col items-center justify-center rounded-md transition-all duration-75"
            style={{
              width: 64,
              height: 72,
              background: active ? "rgba(18, 18, 42, 0.85)" : "rgba(10, 10, 26, 0.7)",
              border: active ? "2px solid #5aabff" : "1px solid #2a2a40",
              opacity: available || i === 0 ? 1 : 0.4,
            }}
          >
            <span
              className="absolute top-1 left-1.5 text-[10px] font-bold"
              style={{ color: active ? "#5aabff" : "#555566" }}
            >
              {slot.key}
            </span>
            <span
              className="text-[11px] font-bold mt-2"
              style={{ color: active ? "#e0daf0" : "#aaaacc" }}
            >
              {i === 1 && data.equippedWeapon
                ? data.equippedWeapon.toUpperCase()
                : slot.label}
            </span>
            {count && (
              <span
                className="text-[10px] font-semibold tabular-nums"
                style={{
                  color: i === 1 && data.ammo === 0 ? "#cc3333" : "#e8c840",
                }}
              >
                {count}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
