"use client";

import { useState, useEffect } from "react";
import { hudState } from "@/game/HUDState";

const DISMISS_MS = 700;

export function MasonAnnouncement() {
  const [visible, setVisible] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50);
    return () => clearTimeout(t);
  }, []);

  const handleDismiss = () => {
    if (dismissing) return;
    setDismissing(true);
    setTimeout(() => {
      hudState.dispatchMasonAnnouncementAction("dismissed");
    }, DISMISS_MS);
  };

  const opacity = dismissing ? 0 : visible ? 1 : 0;
  const transition = dismissing
    ? `opacity ${DISMISS_MS}ms ease-in`
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
      {/* Character sprite centered on black with purple glow */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <div style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse at center, rgba(124,58,237,0.18) 0%, rgba(0,0,0,0) 70%)",
        }} />
        <div style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>
          <img
            src="/assets/mason-intro.png"
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
        </div>
        {/* Bottom gradient so text sits on dark base */}
        <div style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.55) 30%, transparent 60%)",
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
          color: "#7c3aed",
          textTransform: "uppercase",
          textShadow: "0 0 18px rgba(124,58,237,0.9), 0 0 40px rgba(124,58,237,0.4)",
          marginBottom: 4,
        }}>
          M A S O N
        </div>

        {/* Quote */}
        <div style={{
          fontFamily: "var(--font-special-elite), 'Special Elite', serif",
          fontSize: "clamp(15px, 2vw, 24px)",
          color: "rgba(215, 195, 230, 0.92)",
          textAlign: "center",
          fontStyle: "italic",
          maxWidth: 480,
          lineHeight: 1.65,
          textShadow: "0 1px 6px rgba(0,0,0,1)",
        }}>
          &quot;They call it the estate. I call it my dancefloor.&quot;
        </div>

        {/* Dismiss */}
        <button
          type="button"
          onClick={handleDismiss}
          style={{
            marginTop: 18,
            background: "transparent",
            border: "1px solid rgba(124,58,237,0.55)",
            color: "rgba(190,165,220,0.82)",
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
            el.style.background = "rgba(124,58,237,0.22)";
            el.style.color = "#fff";
            el.style.borderColor = "rgba(167,100,255,0.9)";
            el.style.textShadow = "0 0 12px rgba(167,100,255,0.8), 0 0 24px rgba(124,58,237,0.4)";
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLElement;
            el.style.background = "transparent";
            el.style.color = "rgba(190,165,220,0.82)";
            el.style.borderColor = "rgba(124,58,237,0.55)";
            el.style.textShadow = "none";
          }}
        >
          Get ready
        </button>
      </div>
    </div>
  );
}
