"use client";

import { memo, useState, useEffect, useCallback, useSyncExternalStore } from "react";
import { hudState } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";
const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

export const WaveStartConfirm = memo(function WaveStartConfirm() {
  const active = useSyncExternalStore(hudState.subscribe, () => hudState.getField("waveStartConfirmActive"));
  const wave = useSyncExternalStore(hudState.subscribe, () => hudState.getField("wave"));
  const [dontRemind, setDontRemind] = useState(false);

  const handleConfirm = useCallback(() => {
    hudState.dispatchWaveStartConfirmAction("confirm", { skipReminder: dontRemind });
  }, [dontRemind]);

  const handleCancel = useCallback(() => {
    hudState.dispatchWaveStartConfirmAction("cancel");
  }, []);

  // Space or Enter to confirm, Escape or B to go back to shop
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        handleConfirm();
      } else if (e.code === "Escape" || e.code === "KeyB") {
        e.preventDefault();
        handleCancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, handleConfirm, handleCancel]);

  if (!active) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-auto"
      style={{ zIndex: 25 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.75)" }} />

      {/* Dialog */}
      <div
        className="relative flex flex-col items-center"
        style={{
          background: "linear-gradient(180deg, rgba(20, 8, 12, 0.97) 0%, rgba(10, 4, 6, 0.99) 100%)",
          border: "1px solid rgba(160, 30, 30, 0.5)",
          borderRadius: 6,
          padding: "28px 40px 24px",
          maxWidth: 420,
          gap: 18,
        }}
      >
        {/* Title */}
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: 24,
            color: "#ff2244",
            letterSpacing: "0.08em",
            textShadow: "0 0 12px rgba(255, 34, 68, 0.5)",
          }}
        >
          WAVE {wave + 1}
        </span>

        {/* Message */}
        <span
          style={{
            fontFamily: BODY,
            fontSize: 17,
            color: "rgba(215, 195, 175, 0.9)",
            textAlign: "center",
            lineHeight: 1.5,
          }}
        >
          The next round will begin once you leave the shop. Ready up?
        </span>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 14, marginTop: 4 }}>
          <button
            type="button"
            onClick={handleCancel}
            style={{
              fontFamily: BODY,
              fontSize: 14,
              color: "rgba(180, 160, 160, 0.8)",
              background: "transparent",
              border: "1px solid rgba(100, 60, 60, 0.5)",
              borderRadius: 4,
              padding: "8px 22px",
              cursor: "pointer",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(180, 80, 80, 0.7)";
              e.currentTarget.style.color = "#fff";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(100, 60, 60, 0.5)";
              e.currentTarget.style.color = "rgba(180, 160, 160, 0.8)";
            }}
          >
            Back to Shop
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            style={{
              fontFamily: BODY,
              fontSize: 14,
              color: "#fff",
              background: "rgba(160, 30, 30, 0.4)",
              border: "1px solid rgba(220, 60, 60, 0.7)",
              borderRadius: 4,
              padding: "8px 22px",
              cursor: "pointer",
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(200, 40, 40, 0.5)";
              e.currentTarget.style.borderColor = "rgba(255, 80, 80, 0.9)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(160, 30, 30, 0.4)";
              e.currentTarget.style.borderColor = "rgba(220, 60, 60, 0.7)";
            }}
          >
            Bring it on
          </button>
        </div>

        {/* Don't remind checkbox */}
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            cursor: "pointer",
            marginTop: 2,
          }}
        >
          <input
            type="checkbox"
            checked={dontRemind}
            onChange={(e) => setDontRemind(e.target.checked)}
            style={{
              accentColor: "#cc2244",
              width: 14,
              height: 14,
              cursor: "pointer",
            }}
          />
          <span
            style={{
              fontFamily: BODY,
              fontSize: 12,
              color: "rgba(150, 130, 130, 0.7)",
              letterSpacing: "0.05em",
            }}
          >
            Don&apos;t ask me again
          </span>
        </label>
      </div>
    </div>
  );
});
