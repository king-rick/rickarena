"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

const toRoman = (n: number): string => {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ["M", "CM", "D", "CD", "C", "XC", "L", "XL", "X", "IX", "V", "IV", "I"];
  let result = "";
  for (let i = 0; i < vals.length; i++) {
    while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
  }
  return result;
};

export const WaveInfo = memo(function WaveInfo() {
  const wave = useSyncExternalStore(hudState.subscribe, () => hudState.getField("wave"));
  const state = useSyncExternalStore(hudState.subscribe, () => hudState.getField("waveState"));

  const isCleared = state === "intermission";
  const color = isCleared ? "#ffffff" : "#ff2244";

  return (
    <span
      style={{
        fontFamily: DISPLAY,
        fontSize: 22,
        color,
        letterSpacing: "0.08em",
        textShadow: isCleared
          ? "0 0 6px rgba(255, 255, 255, 0.4)"
          : "0 0 6px rgba(255, 34, 68, 0.4)",
        transition: "color 300ms ease, text-shadow 300ms ease",
      }}
    >
      {isCleared ? `WAVE ${toRoman(wave)} CLEAR` : `WAVE ${toRoman(wave)}`}
    </span>
  );
});
