"use client";

import { memo, useState, useEffect, useRef, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

export const ObjectiveTracker = memo(function ObjectiveTracker() {
  const currentObjective = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("currentObjective")
  );

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
        marginTop: 4,
        textAlign: "center" as const,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-special-elite), 'Special Elite', serif",
          fontSize: "18px",
          lineHeight: "22px",
          whiteSpace: "nowrap",
          color: "#ffffff",
          WebkitTextStroke: "2px rgba(180, 20, 20, 0.85)",
          paintOrder: "stroke fill",
          textShadow: "0 1px 3px rgba(0,0,0,0.9)",
          animation: anim,
        }}
      >
        {displayText}
      </span>

      <style>{`
        @keyframes obj-dissolve {
          0% {
            opacity: 1;
            filter: brightness(1);
          }
          20% {
            opacity: 1;
            filter: brightness(1.4);
          }
          50% {
            opacity: 1;
            filter: brightness(1.6) drop-shadow(0 0 6px rgba(255, 30, 0, 0.7));
          }
          100% {
            opacity: 0;
            filter: brightness(0.5) drop-shadow(0 0 2px rgba(255, 0, 0, 0.3));
            transform: translateY(-2px);
          }
        }
        @keyframes obj-appear {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
});
