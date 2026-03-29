"use client";

import { memo, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";
const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

export const WaveInfo = memo(function WaveInfo() {
  const wave = useSyncExternalStore(hudState.subscribe, () => hudState.getField("wave"));
  const state = useSyncExternalStore(hudState.subscribe, () => hudState.getField("waveState"));
  const countdown = useSyncExternalStore(hudState.subscribe, () => hudState.getField("waveCountdown"));

  let label = "";
  let sublabel = "";
  let accent = "#eeeeee";

  // Convert wave number to Roman numerals
  const toRoman = (n: number): string => {
    const vals = [1000,900,500,400,100,90,50,40,10,9,5,4,1];
    const syms = ["M","CM","D","CD","C","XC","L","XL","X","IX","V","IV","I"];
    let result = "";
    for (let i = 0; i < vals.length; i++) {
      while (n >= vals[i]) { result += syms[i]; n -= vals[i]; }
    }
    return result;
  };

  switch (state) {
    case "pre_game":
      label = "GET READY";
      sublabel = "SPACE to start";
      accent = "#ff2244";
      break;
    case "active":
      label = `WAVE ${toRoman(wave)}`;
      accent = "#eeeeee";
      break;
    case "intermission":
      label = `WAVE ${toRoman(wave)} CLEAR`;
      sublabel = countdown > 0 ? `Next in ${countdown}s` : "SPACE to start";
      accent = "#22ff88";
      break;
  }

  return (
    <div className="flex items-baseline gap-2">
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 16,
          color: accent,
          letterSpacing: "0.06em",
          textShadow: `0 0 6px ${accent}44`,
        }}
      >
        {label}
      </span>
      {sublabel && (
        <span
          style={{
            fontFamily: BODY,
            fontSize: 12,
            color: "#778899",
          }}
        >
          {sublabel}
        </span>
      )}
    </div>
  );
});
