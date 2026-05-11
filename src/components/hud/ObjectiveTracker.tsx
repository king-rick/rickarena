"use client";

import { memo, useState, useEffect, useRef, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

export const ObjectiveTracker = memo(function ObjectiveTracker() {
  const currentObjective = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("currentObjective")
  );
  const waveState = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("waveState")
  );
  const isIntermission = waveState === "intermission";

  const [displayText, setDisplayText] = useState<string | null>(currentObjective);
  const [completing, setCompleting] = useState(false);
  const [phase, setPhase] = useState<"idle" | "completing" | "appearing">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (currentObjective === displayText && !completing) return;

    if (timerRef.current !== null) clearTimeout(timerRef.current);

    if (displayText && currentObjective !== displayText) {
      setCompleting(true);
      setPhase("completing");
      timerRef.current = setTimeout(() => {
        setCompleting(false);
        setDisplayText(currentObjective);
        setPhase("appearing");
        timerRef.current = setTimeout(() => setPhase("idle"), 600);
      }, 1400);
    } else if (!displayText && currentObjective) {
      setDisplayText(currentObjective);
      setPhase("appearing");
      timerRef.current = setTimeout(() => setPhase("idle"), 600);
    }

    return () => { if (timerRef.current !== null) clearTimeout(timerRef.current); };
  }, [currentObjective]);

  if (!displayText) return null;

  const isCompleting = phase === "completing";

  const anim = isCompleting
    ? "obj-dissolve 1.3s ease-in-out forwards"
    : phase === "appearing"
      ? "obj-appear 0.5s ease-out"
      : "none";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "4px 10px",
        background: "linear-gradient(180deg, rgba(8, 4, 12, 0.6) 0%, rgba(16, 8, 16, 0.65) 100%)",
        border: "1px solid rgba(255, 34, 68, 0.25)",
        borderRadius: 3,
        boxShadow: "0 0 8px rgba(0, 0, 0, 0.6), 0 0 4px rgba(255, 34, 68, 0.1)",
        animation: isCompleting ? anim : phase === "appearing" ? anim : isIntermission ? "obj-urgent 1s ease-in-out infinite" : "obj-glow 2.5s ease-in-out infinite",
      }}
    >
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 12,
          color: "rgba(255, 34, 68, 0.6)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          lineHeight: 1,
        }}
      >
        Objective
      </span>
      <span
        style={{
          fontFamily: DISPLAY,
          fontSize: 16,
          color: "#e8e0e0",
          textShadow: "0 0 4px rgba(255, 34, 68, 0.3), 0 1px 2px rgba(0, 0, 0, 0.9)",
          letterSpacing: 1,
          lineHeight: 1.3,
          marginTop: 2,
        }}
      >
        {displayText}
      </span>

      <style>{`
        @keyframes obj-dissolve {
          0% { opacity: 1; filter: brightness(1); }
          20% { opacity: 1; filter: brightness(1.4); }
          50% { opacity: 1; filter: brightness(1.6) drop-shadow(0 0 6px rgba(255, 30, 0, 0.7)); }
          100% { opacity: 0; filter: brightness(0.5); transform: translateY(-2px); }
        }
        @keyframes obj-appear {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes obj-glow {
          0%, 100% { box-shadow: 0 0 8px rgba(0, 0, 0, 0.6), 0 0 4px rgba(255, 34, 68, 0.15); border-color: rgba(255, 34, 68, 0.3); }
          50% { box-shadow: 0 0 16px rgba(255, 34, 68, 0.5), 0 0 32px rgba(255, 34, 68, 0.25), 0 0 6px rgba(0, 0, 0, 0.6); border-color: rgba(255, 34, 68, 0.7); }
        }
        @keyframes obj-urgent {
          0%, 100% { box-shadow: 0 0 8px rgba(0, 0, 0, 0.6), 0 0 6px rgba(255, 34, 68, 0.3); border-color: rgba(255, 34, 68, 0.5); filter: brightness(1); }
          50% { box-shadow: 0 0 20px rgba(255, 34, 68, 0.7), 0 0 40px rgba(255, 34, 68, 0.35), 0 0 8px rgba(0, 0, 0, 0.6); border-color: rgba(255, 68, 100, 0.9); filter: brightness(1.15); }
        }
      `}</style>
    </div>
  );
});
