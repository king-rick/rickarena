"use client";

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const DISMISS_MS = 400;

export function ScaryboiIntro() {
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRafRef = useRef<number | null>(null);

  const sfxVolume = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("sfxVolume")
  );
  const quote = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("scaryboiQuote")
  );
  const voSrc = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("scaryboiVoSrc")
  );

  // Slide up after mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Voice-over plays when banner becomes visible (skip if no VO for this encounter)
  useEffect(() => {
    if (!visible || !voSrc) return;
    const a = new Audio(voSrc);
    a.volume = sfxVolume;
    audioRef.current = a;
    void a.play().catch(() => { /* autoplay blocked — cutscene still works */ });
    return () => {
      if (fadeRafRef.current !== null) {
        cancelAnimationFrame(fadeRafRef.current);
        fadeRafRef.current = null;
      }
      a.pause();
      a.src = "";
      if (audioRef.current === a) audioRef.current = null;
    };
  }, [visible, voSrc]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = sfxVolume;
  }, [sfxVolume]);

  const stopVoFade = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    const startVol = a.volume;
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / DISMISS_MS);
      a.volume = startVol * (1 - t);
      if (t < 1) {
        fadeRafRef.current = requestAnimationFrame(tick);
      } else {
        fadeRafRef.current = null;
        a.pause();
        a.src = "";
        if (audioRef.current === a) audioRef.current = null;
      }
    };
    fadeRafRef.current = requestAnimationFrame(tick);
  }, []);

  const handleDismiss = () => {
    if (dismissing) return;
    setDismissing(true);
    stopVoFade();
    setTimeout(() => {
      hudState.dispatchScaryboiIntroAction("dismissed");
    }, DISMISS_MS);
  };

  // Slide up from bottom, slide down on dismiss
  const translateY = dismissing ? "100%" : visible ? "0%" : "100%";
  const transition = dismissing
    ? `transform ${DISMISS_MS}ms ease-in, opacity ${DISMISS_MS}ms ease-in`
    : "transform 400ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms ease-out";
  const opacity = dismissing ? 0 : visible ? 1 : 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(5,0,0,0.88) 100%)",
        borderTop: "2px solid rgba(160,20,20,0.7)",
        padding: "18px 48px 22px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        transform: `translateY(${translateY})`,
        opacity,
        transition,
        zIndex: 100,
      }}
    >
      {/* Name */}
      <div style={{
        fontFamily: "var(--font-special-elite), 'Special Elite', serif",
        fontSize: "clamp(18px, 2.5vw, 34px)",
        letterSpacing: "0.45em",
        color: "#cc1a1a",
        textTransform: "uppercase",
        textShadow: "0 0 18px rgba(200,0,0,0.9), 0 0 40px rgba(200,0,0,0.4)",
      }}>
        S C A R Y B O I
      </div>

      {/* Quote */}
      <div style={{
        fontFamily: "var(--font-special-elite), 'Special Elite', serif",
        fontSize: "clamp(13px, 1.6vw, 20px)",
        color: "rgba(215, 195, 175, 0.92)",
        textAlign: "center",
        fontStyle: "italic",
        maxWidth: 520,
        lineHeight: 1.65,
        textShadow: "0 1px 6px rgba(0,0,0,1)",
      }}>
        &quot;{quote}&quot;
      </div>

      {/* Dismiss button */}
      <button
        type="button"
        onClick={handleDismiss}
        style={{
          marginTop: 10,
          background: "transparent",
          border: "1px solid rgba(160, 30, 30, 0.55)",
          color: "rgba(195, 155, 155, 0.82)",
          fontFamily: "var(--font-special-elite), 'Special Elite', serif",
          fontSize: "clamp(9px, 1vw, 12px)",
          letterSpacing: "0.22em",
          padding: "6px 20px",
          cursor: "pointer",
          textTransform: "uppercase",
          opacity: visible && !dismissing ? 1 : 0,
          transition: visible && !dismissing
            ? "opacity 400ms ease-out 500ms, background 150ms, color 150ms, border-color 150ms"
            : "opacity 200ms ease-out",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = "rgba(160,30,30,0.22)";
          el.style.color = "#fff";
          el.style.borderColor = "rgba(220,60,60,0.9)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.background = "transparent";
          el.style.color = "rgba(195,155,155,0.82)";
          el.style.borderColor = "rgba(160,30,30,0.55)";
        }}
      >
        Bring it &nbsp;&middot;&nbsp; [ SPACE ]
      </button>
    </div>
  );
}
