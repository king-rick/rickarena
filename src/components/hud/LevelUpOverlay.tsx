"use client";

import { memo, useSyncExternalStore, useEffect, useState, useCallback } from "react";
import { hudState } from "@/game/HUDState";
import type { BuffOption } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";
const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

const TIER_COLORS: Record<string, { border: string; glow: string; label: string }> = {
  basic: { border: "#44aa44", glow: "rgba(68, 170, 68, 0.3)", label: "#44aa44" },
  advanced: { border: "#4488dd", glow: "rgba(68, 136, 221, 0.3)", label: "#4488dd" },
  elite: { border: "#ddaa22", glow: "rgba(221, 170, 34, 0.4)", label: "#ddaa22" },
};

export const LevelUpOverlay = memo(function LevelUpOverlay() {
  const active = useSyncExternalStore(hudState.subscribe, () => hudState.getField("levelUpActive"));
  const level = useSyncExternalStore(hudState.subscribe, () => hudState.getField("levelUpLevel"));
  const options = useSyncExternalStore(hudState.subscribe, () => hudState.getField("levelUpOptions"));
  const [selected, setSelected] = useState(0);

  // Reset selection when new options appear
  useEffect(() => {
    if (active) setSelected(0);
  }, [active]);

  const confirm = useCallback((index: number) => {
    hudState.dispatchLevelUpAction("select", index);
  }, []);

  useEffect(() => {
    if (!active) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        setSelected(s => Math.max(0, s - 1));
      } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        setSelected(s => Math.min(options.length - 1, s + 1));
      } else if (e.key === "Enter") {
        confirm(selected);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [active, options.length, selected, confirm]);

  if (!active || options.length === 0) return null;

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center pointer-events-auto"
      style={{ zIndex: 25 }}
    >
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.6)" }} />

      <span
        className="relative"
        style={{
          fontFamily: DISPLAY,
          fontSize: 60,
          color: "#ff2244",
          letterSpacing: "0.08em",
          textShadow: "0 0 16px rgba(255, 34, 68, 0.5)",
          marginBottom: 8,
        }}
      >
        LEVEL {level}
      </span>
      <span
        className="relative"
        style={{ fontFamily: BODY, fontSize: 22, color: "#aaaaaa", marginBottom: 24 }}
      >
        Choose a buff
      </span>

      <div className="relative flex" style={{ gap: 24 }}>
        {options.map((opt, i) => (
          <BuffCard
            key={i}
            option={opt}
            focused={i === selected}
            onClick={() => confirm(i)}
            onHover={() => setSelected(i)}
          />
        ))}
      </div>
    </div>
  );
});

function BuffCard({
  option,
  focused,
  onClick,
  onHover,
}: {
  option: BuffOption;
  focused: boolean;
  onClick: () => void;
  onHover: () => void;
}) {
  const tier = TIER_COLORS[option.tier] ?? TIER_COLORS.basic;

  return (
    <div
      className="relative flex flex-col items-center justify-center"
      style={{
        width: 240,
        height: 200,
        cursor: "pointer",
        backgroundImage: "url(/assets/sprites/ui/horror/card-dark.png)",
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
        border: `2px solid ${focused ? tier.border : "#333344"}`,
        boxShadow: focused ? `0 0 20px ${tier.glow}, inset 0 0 12px ${tier.glow}` : "none",
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        padding: "18px 16px",
        gap: 6,
      }}
      onMouseEnter={onHover}
      onClick={onClick}
    >
      <span
        style={{
          fontFamily: BODY,
          fontSize: 13,
          color: "#777788",
          letterSpacing: "0.1em",
        }}
      >
        {option.category.toUpperCase()}
      </span>
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 22,
          color: "#ffffff",
          textAlign: "center",
          textShadow: "0 0 6px rgba(255, 255, 255, 0.1)",
        }}
      >
        {option.name}
      </span>
      <span style={{ fontFamily: BODY, fontSize: 16, color: "#bbbbbb", textAlign: "center" }}>
        {option.desc}
      </span>
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 14,
          color: tier.label,
          letterSpacing: "0.12em",
          marginTop: 4,
          textShadow: `0 0 6px ${tier.glow}`,
        }}
      >
        {option.tier.toUpperCase()}
      </span>
    </div>
  );
}
