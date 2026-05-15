"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";
import type { ConsumableSlot } from "@/game/HUDState";

const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

export const ConsumableHotbar = memo(function ConsumableHotbar() {
  const slots = useSyncExternalStore(hudState.subscribe, () => hudState.getField("consumableSlots"));
  const activeSlot = useSyncExternalStore(hudState.subscribe, () => hudState.getField("consumableActiveSlot"));

  const hotbarSlots: (ConsumableSlot & { idx: number })[] = [];
  for (let i = 0; i < Math.min(4, slots.length); i++) {
    if (slots[i] && slots[i].type) {
      hotbarSlots.push({ ...slots[i], idx: i });
    }
  }

  if (hotbarSlots.length === 0) return null;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 3,
      alignSelf: "flex-start",
    }}>
      {hotbarSlots.map(slot => {
        const isActive = slot.idx === activeSlot;
        const isEmpty = slot.count <= 0;
        return (
          <div
            key={slot.idx}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              width: 48,
              height: 48,
              position: "relative",
              background: isActive
                ? "linear-gradient(180deg, rgba(255, 34, 68, 0.2) 0%, rgba(255, 34, 68, 0.15) 100%)"
                : "linear-gradient(180deg, rgba(8, 4, 12, 0.6) 0%, rgba(16, 8, 16, 0.65) 100%)",
              border: isActive
                ? "1px solid rgba(255, 34, 68, 0.7)"
                : "1px solid rgba(255, 34, 68, 0.25)",
              borderRadius: 3,
              boxShadow: isActive
                ? "0 0 10px rgba(255, 34, 68, 0.4), 0 0 4px rgba(255, 34, 68, 0.2)"
                : "0 0 8px rgba(0, 0, 0, 0.6), 0 0 4px rgba(255, 34, 68, 0.1)",
              transition: "all 150ms ease-out",
              opacity: isEmpty ? 0.35 : 1,
            }}
          >
            {/* Key label — top left corner */}
            <span style={{
              position: "absolute",
              top: 2,
              left: 4,
              fontFamily: DISPLAY,
              fontSize: 14,
              color: isActive ? "rgba(255, 200, 200, 0.95)" : "rgba(255, 34, 68, 0.55)",
              lineHeight: 1,
              textShadow: "0 1px 2px rgba(0,0,0,0.8)",
            }}>
              {slot.idx + 1}
            </span>
            {/* Count — top right corner */}
            {!isEmpty && (
              <span style={{
                position: "absolute",
                top: 2,
                right: 4,
                fontFamily: DISPLAY,
                fontSize: 13,
                fontWeight: "bold",
                color: isActive ? "#ffffff" : "#e8e0e0",
                textShadow: "0 1px 3px rgba(0, 0, 0, 0.9), 0 0 6px rgba(0, 0, 0, 0.6)",
                lineHeight: 1,
              }}>
                <span style={{ fontSize: 9, opacity: 0.7 }}>x</span>{slot.count}
              </span>
            )}
            {/* Icon — centered */}
            <img
              src={slot.icon}
              alt=""
              style={{
                width: 32,
                height: 32,
                imageRendering: "pixelated",
                marginTop: 4,
                filter: isActive
                  ? "drop-shadow(0 0 4px rgba(255, 34, 68, 0.5)) brightness(1.2)"
                  : isEmpty
                    ? "grayscale(0.8) drop-shadow(0 0 1px rgba(255, 34, 68, 0.1))"
                    : "drop-shadow(0 0 2px rgba(255, 34, 68, 0.2))",
              }}
              draggable={false}
            />
          </div>
        );
      })}
    </div>
  );
});
