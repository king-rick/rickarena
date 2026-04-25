"use client";

import { memo, useSyncExternalStore, useEffect, useCallback } from "react";
import { hudState } from "@/game/HUDState";
import type { ShopItemData } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";
const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

export const ShopOverlay = memo(function ShopOverlay() {
  const shopOpen = useSyncExternalStore(hudState.subscribe, () => hudState.getField("shopOpen"));
  const items = useSyncExternalStore(hudState.subscribe, () => hudState.getField("shopItems"));
  const currency = useSyncExternalStore(hudState.subscribe, () => hudState.getField("currency"));
  const selectedIndex = useSyncExternalStore(hudState.subscribe, () => hudState.getField("shopSelectedIndex"));
  const message = useSyncExternalStore(hudState.subscribe, () => hudState.getField("shopMessage"));
  const messageColor = useSyncExternalStore(hudState.subscribe, () => hudState.getField("shopMessageColor"));

  const handleBuy = useCallback((idx: number) => {
    hudState.dispatchShopAction("buy", idx);
  }, []);

  const handleHover = useCallback((idx: number) => {
    hudState.dispatchShopAction("hover", idx);
  }, []);

  useEffect(() => {
    if (!shopOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter") { hudState.dispatchShopAction("buySelected"); return; }
      if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") { hudState.dispatchShopAction("nav", 0); return; }
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") { hudState.dispatchShopAction("nav", 1); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shopOpen]);

  if (!shopOpen || items.length === 0) return null;

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-auto"
      style={{ zIndex: 20, fontFamily: BODY }}
    >
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.85)" }} />

      <div
        className="relative"
        style={{
          width: "min(88%, 480px)",
          maxHeight: "min(90%, 580px)",
          backgroundImage: "url(/assets/sprites/ui/horror/panel-frame.png)",
          backgroundSize: "100% 100%",
          imageRendering: "pixelated",
          padding: "20px 28px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          className="absolute"
          style={{ inset: 10, background: "rgba(8, 8, 16, 0.90)", borderRadius: 2 }}
        />

        {/* Header */}
        <div className="relative flex items-center justify-between" style={{ marginBottom: 12, padding: "0 4px" }}>
          <span
            style={{
              fontFamily: DISPLAY,
              fontSize: 42,
              color: "#ff2244",
              letterSpacing: "0.1em",
              textShadow: "0 0 12px rgba(255, 34, 68, 0.5)",
            }}
          >
            SHOP
          </span>
          <span
            style={{
              fontFamily: BODY,
              fontSize: 28,
              color: "#ffffff",
              textShadow: "0 0 8px rgba(255, 255, 255, 0.2)",
            }}
          >
            ${currency}
          </span>
        </div>

        {/* Divider */}
        <div
          className="relative"
          style={{
            height: 4,
            marginBottom: 12,
            backgroundImage: "url(/assets/sprites/ui/horror/divider.png)",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
          }}
        />

        {/* Single column item list */}
        <div
          className="relative flex flex-col"
          style={{ flex: 1, minHeight: 0, overflowY: "auto", gap: 6 }}
        >
          {items.map((item, i) => (
            <ShopRow
              key={item.id}
              item={item}
              selected={i === selectedIndex}
              onBuy={() => handleBuy(i)}
              onHover={() => handleHover(i)}
            />
          ))}
        </div>

        {/* Flash message */}
        {message && (
          <div className="relative flex justify-center" style={{ marginTop: 8 }}>
            <span
              style={{
                fontSize: 18,
                fontFamily: BODY,
                color: "#ffffff",
                WebkitTextStroke: "1px rgba(180, 20, 20, 0.85)",
                paintOrder: "stroke fill" as const,
                textShadow: "0 0 6px rgba(255, 34, 68, 0.4)",
              }}
            >
              {message}
            </span>
          </div>
        )}
      </div>
    </div>
  );
});

const ShopRow = memo(function ShopRow({
  item, selected, onBuy, onHover,
}: {
  item: ShopItemData; selected: boolean; onBuy: () => void; onHover: () => void;
}) {
  const canBuy = item.canAfford && !item.equipped && !item.locked;

  return (
    <div
      className="flex items-center"
      style={{
        fontFamily: "var(--font-special-elite), 'Special Elite', serif",
        background: selected
          ? "rgba(255, 34, 68, 0.08)"
          : "rgba(255, 255, 255, 0.02)",
        border: selected
          ? "1px solid rgba(255, 34, 68, 0.45)"
          : "1px solid rgba(255, 255, 255, 0.06)",
        borderRadius: 4,
        padding: "8px 12px",
        cursor: canBuy ? "pointer" : "default",
        gap: 12,
        transition: "border-color 100ms ease, background 100ms ease",
        opacity: item.canAfford || item.equipped ? 1 : 0.5,
      }}
      onClick={onBuy}
      onMouseEnter={onHover}
    >
      {/* Icon */}
      {item.icon && (
        <img
          src={item.icon}
          alt=""
          style={{
            width: 36,
            height: 36,
            imageRendering: "pixelated",
            flexShrink: 0,
          }}
        />
      )}

      {/* Name + desc */}
      <div className="flex flex-col" style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          fontSize: 17,
          color: item.equipped ? "#ff4466" : "#e0daf0",
          lineHeight: 1.2,
        }}>
          {item.name.toUpperCase()}
        </span>
        <span style={{ fontSize: 13, color: "#777799", lineHeight: 1.3 }}>
          {item.desc}
        </span>
      </div>

      {/* Price */}
      <span
        style={{
          fontSize: 18,
          color: item.equipped ? "#ff4466" : item.canAfford ? "#ffffff" : "#553333",
          flexShrink: 0,
          textAlign: "right",
          minWidth: 60,
        }}
      >
        {item.equipped ? "OWNED" : `$${item.price}`}
      </span>
    </div>
  );
});
