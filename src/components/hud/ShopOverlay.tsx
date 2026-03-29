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
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { hudState.dispatchShopAction("nav", 2); return; }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { hudState.dispatchShopAction("nav", 3); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shopOpen]);

  if (!shopOpen || items.length === 0) return null;

  const supplies = items.filter((i) => i.category === "supplies");
  const weapons = items.filter((i) => i.category === "weapons");
  const traps = items.filter((i) => i.category === "traps");

  const columns: { title: string; items: ShopItemData[] }[] = [
    { title: "SUPPLIES", items: supplies },
    { title: "WEAPONS", items: weapons },
    { title: "TRAPS", items: traps },
  ];

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-auto"
      style={{ zIndex: 20, fontFamily: BODY }}
    >
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.85)" }} />

      <div
        className="relative"
        style={{
          width: "min(92%, 960px)",
          maxHeight: "min(88%, 620px)",
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
          style={{ inset: 10, background: "rgba(8, 8, 16, 0.85)", borderRadius: 2 }}
        />

        {/* Header */}
        <div className="relative flex items-center justify-between" style={{ marginBottom: 10, padding: "0 8px" }}>
          <span
            style={{
              fontFamily: DISPLAY,
              fontSize: 48,
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
              fontSize: 36,
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
            height: 6,
            marginBottom: 16,
            backgroundImage: "url(/assets/sprites/ui/horror/divider.png)",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
          }}
        />

        {/* Three columns */}
        <div className="relative flex gap-3" style={{ flex: 1, minHeight: 0 }}>
          {columns.map((col) => (
            <div key={col.title} className="flex flex-col" style={{ flex: 1, gap: 8 }}>
              <span
                style={{
                  fontFamily: BODY,
                  fontSize: 15,
                  color: "#775566",
                  letterSpacing: "0.15em",
                  marginBottom: 4,
                  paddingLeft: 4,
                }}
              >
                {col.title}
              </span>
              {col.items.map((item) => {
                const globalIdx = items.indexOf(item);
                const isSelected = globalIdx === selectedIndex;
                return (
                  <ShopCard
                    key={item.id}
                    item={item}
                    selected={isSelected}
                    onBuy={() => handleBuy(globalIdx)}
                    onHover={() => handleHover(globalIdx)}
                  />
                );
              })}
            </div>
          ))}
        </div>

        {/* Flash message */}
        {message && (
          <div className="relative flex justify-center" style={{ marginTop: 8 }}>
            <span
              style={{
                fontSize: 22,
                color: messageColor || "#44cc44",
                fontFamily: DISPLAY,
                textShadow: `0 0 8px ${messageColor || "#44cc44"}55`,
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

const ShopCard = memo(function ShopCard({
  item, selected, onBuy, onHover,
}: {
  item: ShopItemData; selected: boolean; onBuy: () => void; onHover: () => void;
}) {
  const borderColor = selected ? "rgba(255, 34, 68, 0.6)" : "transparent";
  const bgColor = selected ? "rgba(26, 10, 16, 0.9)" : "rgba(12, 12, 20, 0.8)";

  let nameColor = "#e0daf0";
  let descColor = "#8a8aaa";
  let priceText = `$${item.price}`;
  let priceColor = item.canAfford ? "#ffffff" : "#663333";
  let iconAlpha = item.canAfford ? 1 : 0.5;

  if (item.locked) {
    nameColor = "#444055";
    descColor = "#333044";
    priceText = `WAVE ${item.unlockWave}`;
    priceColor = "#553333";
    iconAlpha = 0.3;
  } else if (item.equipped) {
    nameColor = "#ff4466";
    priceText = "EQUIPPED";
    priceColor = "#ff4466";
    iconAlpha = 1;
  }

  return (
    <div
      className="flex items-center"
      style={{
        fontFamily: "var(--font-special-elite), 'Special Elite', serif",
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 4,
        padding: "8px 10px",
        cursor: "pointer",
        gap: 10,
        minHeight: 72,
        transition: "border-color 100ms ease",
      }}
      onClick={onBuy}
      onMouseEnter={onHover}
    >
      {item.icon && (
        <img
          src={item.icon}
          alt=""
          style={{ width: 40, height: 40, imageRendering: "pixelated", opacity: iconAlpha, flexShrink: 0 }}
        />
      )}
      <div className="flex flex-col" style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 18, color: nameColor, lineHeight: 1.2 }}>
          {item.name.toUpperCase()}
        </span>
        <span style={{ fontSize: 14, color: descColor, lineHeight: 1.3 }}>
          {item.locked ? "???" : item.desc}
        </span>
      </div>
      <span
        style={{
          fontSize: 20,
          color: priceColor,
          flexShrink: 0,
          textAlign: "right",
          minWidth: 70,
          textShadow: "none",
        }}
      >
        {priceText}
      </span>
    </div>
  );
});
