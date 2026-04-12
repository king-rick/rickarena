"use client";

import { useState, useEffect } from "react";
import { hudState } from "@/game/HUDState";

export function ScaryboiIntro() {
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    // Small delay so the fade-in transition fires after mount
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleDismiss = () => {
    if (dismissing) return;
    setDismissing(true);
    setTimeout(() => {
      hudState.dispatchScaryboiIntroAction("dismissed");
    }, 700);
  };

  const opacity = dismissing ? 0 : visible ? 1 : 0;
  const transition = dismissing
    ? "opacity 700ms ease-in"
    : "opacity 900ms ease-out";

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#000",
        opacity,
        transition,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        cursor: "default",
      }}
    >
      {/* Image with Ken Burns slow zoom */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <img
          src="/assets/scaryboi-intro.png"
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: visible && !dismissing ? "scale(1.05)" : "scale(1.0)",
            transition: "transform 6000ms ease-out",
            display: "block",
          }}
        />
        {/* Bottom gradient so text sits on a dark base */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.92) 0%, rgba(0,0,0,0.45) 35%, transparent 65%)",
        }} />
      </div>

      {/* Text + dismiss — pinned to bottom, above gradient */}
      <div style={{
        position: "absolute",
        bottom: "10%",
        left: 0,
        right: 0,
        zIndex: 3,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "0 40px",
      }}>
        {/* Name */}
        <div style={{
          fontFamily: "var(--font-special-elite), 'Special Elite', serif",
          fontSize: "clamp(24px, 3.5vw, 48px)",
          letterSpacing: "0.45em",
          color: "#cc1a1a",
          textTransform: "uppercase",
          textShadow: "0 0 18px rgba(200,0,0,0.9), 0 0 40px rgba(200,0,0,0.4)",
          marginBottom: 4,
        }}>
          S C A R Y B O I
        </div>

        {/* Quote */}
        <div style={{
          fontFamily: "var(--font-special-elite), 'Special Elite', serif",
          fontSize: "clamp(15px, 2vw, 24px)",
          color: "rgba(215, 195, 175, 0.92)",
          textAlign: "center",
          fontStyle: "italic",
          maxWidth: 480,
          lineHeight: 1.65,
          textShadow: "0 1px 6px rgba(0,0,0,1)",
        }}>
          "You lasted longer than the others. Admirable, but mistaken..."
        </div>

        {/* Dismiss — only shown once fully visible */}
        <button
          onClick={handleDismiss}
          style={{
            marginTop: 18,
            background: "transparent",
            border: "1px solid rgba(160, 30, 30, 0.55)",
            color: "rgba(195, 155, 155, 0.82)",
            fontFamily: "var(--font-special-elite), 'Special Elite', serif",
            fontSize: "clamp(9px, 1.1vw, 13px)",
            letterSpacing: "0.22em",
            padding: "7px 22px",
            cursor: "pointer",
            textTransform: "uppercase",
            opacity: visible && !dismissing ? 1 : 0,
            transition: visible && !dismissing
              ? "opacity 400ms ease-out 600ms, background 150ms, color 150ms, border-color 150ms, text-shadow 150ms"
              : "opacity 400ms ease-out, background 150ms, color 150ms, border-color 150ms, text-shadow 150ms",
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "rgba(160,30,30,0.22)";
            el.style.color = "#fff";
            el.style.borderColor = "rgba(220,60,60,0.9)";
            el.style.textShadow = "0 0 12px rgba(255,80,80,0.8), 0 0 24px rgba(200,0,0,0.4)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "transparent";
            el.style.color = "rgba(195,155,155,0.82)";
            el.style.borderColor = "rgba(160,30,30,0.55)";
            el.style.textShadow = "none";
          }}
        >
          Bring it
        </button>
      </div>
    </div>
  );
}
