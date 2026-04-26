"use client";

import { useState, useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const DISMISS_MS = 400;
const SPEED_MULT = 0.82; // slightly faster than 1:1 voice sync

export function ScaryboiIntro() {
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [displayedChars, setDisplayedChars] = useState(0);
  const [typewriterDone, setTypewriterDone] = useState(false);
  const [typewriterStarted, setTypewriterStarted] = useState(false);
  const [audioEnded, setAudioEnded] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeRafRef = useRef<number | null>(null);
  const typewriterTimerRef = useRef<number | null>(null);

  const sfxVolume = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("sfxVolume")
  );
  const quotes = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("scaryboiQuotes")
  );
  const timings = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("scaryboiQuoteTimings")
  );
  const voSrc = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("scaryboiVoSrc")
  );
  const devMode = useSyncExternalStore(
    hudState.subscribe,
    () => hudState.getField("devMode")
  );

  const currentQuote = quotes[quoteIndex] ?? "";
  const isLastQuote = quoteIndex >= quotes.length - 1;
  const allQuotesDone = isLastQuote && typewriterDone;
  const canDismiss = (allQuotesDone && audioEnded) || devMode;

  // Get type speed for current quote — sync with voice if timing available
  const getTypeSpeedMs = useCallback(() => {
    if (timings.length === 0 || !timings[quoteIndex]) return 35;
    const t = timings[quoteIndex];
    const chars = (quotes[quoteIndex] ?? "").length;
    if (chars <= 0) return 35;
    return Math.max(15, Math.floor((t.durationMs * SPEED_MULT) / chars));
  }, [timings, quoteIndex, quotes]);

  // Reset typewriter when quote changes
  useEffect(() => {
    setDisplayedChars(0);
    setTypewriterDone(false);
    setTypewriterStarted(false);
  }, [quoteIndex]);

  // Start typewriter for each quote
  // Quote 0: delay by its startMs (audio lead-in)
  // Subsequent quotes: start immediately (auto-advance timer already waited)
  useEffect(() => {
    if (!visible || typewriterStarted) return;

    if (quoteIndex === 0 && timings.length > 0 && timings[0]) {
      const delay = timings[0].startMs;
      const t = window.setTimeout(() => setTypewriterStarted(true), delay);
      return () => clearTimeout(t);
    } else {
      setTypewriterStarted(true);
    }
  }, [visible, typewriterStarted, timings, quoteIndex]);

  // Typewriter tick
  useEffect(() => {
    if (!visible || !typewriterStarted || typewriterDone) return;
    if (displayedChars >= currentQuote.length) {
      setTypewriterDone(true);
      return;
    }
    const speed = getTypeSpeedMs();
    const t = window.setTimeout(() => setDisplayedChars(prev => prev + 1), speed);
    typewriterTimerRef.current = t;
    return () => clearTimeout(t);
  }, [visible, typewriterStarted, displayedChars, currentQuote, typewriterDone, getTypeSpeedMs]);

  // Auto-advance quotes based on audio timeline — no user interaction between quotes
  useEffect(() => {
    if (!visible || timings.length <= 1) return;

    const timers: number[] = [];
    for (let i = 1; i < timings.length; i++) {
      const t = window.setTimeout(() => setQuoteIndex(i), timings[i].startMs);
      timers.push(t);
    }

    return () => timers.forEach(t => clearTimeout(t));
  }, [visible, timings]);

  // Slide up after mount
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  // Voice-over plays when banner becomes visible — continuous, no pausing between quotes
  useEffect(() => {
    if (!visible || !voSrc) return;
    const a = new Audio(voSrc);
    a.volume = sfxVolume;
    audioRef.current = a;
    a.addEventListener("ended", () => setAudioEnded(true));
    void a.play().catch(() => {});
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
    if (a.ended) {
      // Audio already finished — just clean up
      a.src = "";
      if (audioRef.current === a) audioRef.current = null;
      return;
    }
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

  const handleDismiss = useCallback(() => {
    if (dismissing) return;

    // Dev mode: skip everything immediately
    if (devMode) {
      setDismissing(true);
      stopVoFade();
      setTimeout(() => {
        hudState.dispatchScaryboiIntroAction("dismissed");
      }, DISMISS_MS);
      return;
    }

    // Not dismissable yet — audio still playing
    if (!canDismiss) return;

    // All done — dismiss
    setDismissing(true);
    stopVoFade();
    setTimeout(() => {
      hudState.dispatchScaryboiIntroAction("dismissed");
    }, DISMISS_MS);
  }, [dismissing, devMode, canDismiss, stopVoFade]);

  // Listen for Space key to dismiss
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        handleDismiss();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleDismiss]);

  const translateY = dismissing ? "100%" : visible ? "0%" : "100%";
  const transition = dismissing
    ? `transform ${DISMISS_MS}ms ease-in, opacity ${DISMISS_MS}ms ease-in`
    : "transform 400ms cubic-bezier(0.16, 1, 0.3, 1), opacity 300ms ease-out";
  const opacity = dismissing ? 0 : visible ? 1 : 0;

  const visibleText = currentQuote.slice(0, displayedChars);

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
        minHeight: 140,
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

      {/* Quote — typewriter effect */}
      <div style={{
        fontFamily: "var(--font-special-elite), 'Special Elite', serif",
        fontSize: "clamp(13px, 1.6vw, 20px)",
        color: "rgba(215, 195, 175, 0.92)",
        textAlign: "center",
        maxWidth: 520,
        minHeight: 52,
        lineHeight: 1.65,
        textShadow: "0 1px 6px rgba(0,0,0,1)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        {visibleText}
        {!typewriterDone && (
          <span style={{ opacity: 0.6, animation: "blink 0.5s step-end infinite" }}>▌</span>
        )}
      </div>

      {/* Dismiss button — visible only after audio has fully played and all text typed */}
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
          opacity: canDismiss && visible && !dismissing ? 1 : 0,
          pointerEvents: canDismiss && visible && !dismissing ? "auto" : "none",
          transition: canDismiss && visible && !dismissing
            ? "opacity 300ms ease-out, background 150ms, color 150ms, border-color 150ms"
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
        Bring it
      </button>

      <style>{`@keyframes blink { 50% { opacity: 0; } }`}</style>
    </div>
  );
}
