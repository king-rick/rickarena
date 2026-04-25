"use client";

import { memo, useSyncExternalStore, useEffect, useState, useCallback } from "react";
import { hudState } from "@/game/HUDState";
import type { InventorySlot, BuffOption } from "@/game/HUDState";

const BODY = "var(--font-special-elite), 'Special Elite', serif";
const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

const WEAPON_ICONS: Record<string, string> = {
  pistol: "/assets/sprites/items/pistol.png",
  shotgun: "/assets/sprites/items/shotgun.png",
  smg: "/assets/sprites/items/smg.png",
  assault_rifle: "/assets/sprites/items/assault-rifle.png",
  rpg: "/assets/sprites/items/rpg.png",
};

export const InventoryScreen = memo(function InventoryScreen() {
  const open = useSyncExternalStore(hudState.subscribe, () => hudState.getField("inventoryOpen"));
  const paused = useSyncExternalStore(hudState.subscribe, () => hudState.getField("paused"));
  const characterName = useSyncExternalStore(hudState.subscribe, () => hudState.getField("characterName"));
  const characterId = useSyncExternalStore(hudState.subscribe, () => hudState.getField("characterId"));
  const level = useSyncExternalStore(hudState.subscribe, () => hudState.getField("level"));
  const wave = useSyncExternalStore(hudState.subscribe, () => hudState.getField("wave"));
  const kills = useSyncExternalStore(hudState.subscribe, () => hudState.getField("kills"));
  const currency = useSyncExternalStore(hudState.subscribe, () => hudState.getField("currency"));
  const equippedWeapon = useSyncExternalStore(hudState.subscribe, () => hudState.getField("equippedWeapon"));
  const ammo = useSyncExternalStore(hudState.subscribe, () => hudState.getField("ammo"));
  const reserveAmmo = useSyncExternalStore(hudState.subscribe, () => hudState.getField("reserveAmmo"));
  const effective = useSyncExternalStore(hudState.subscribe, () => hudState.getField("statsEffective"));
  const buffs = useSyncExternalStore(hudState.subscribe, () => hudState.getField("statsBuffs"));
  const xp = useSyncExternalStore(hudState.subscribe, () => hudState.getField("statsXp"));
  const xpNeeded = useSyncExternalStore(hudState.subscribe, () => hudState.getField("statsXpNeeded"));
  const slots = useSyncExternalStore(hudState.subscribe, () => hudState.getField("inventorySlots"));
  const hasAxe = useSyncExternalStore(hudState.subscribe, () => hudState.getField("inventoryHasAxe"));
  const grenadeCount = useSyncExternalStore(hudState.subscribe, () => hudState.getField("grenadeCount"));

  // Level-up state
  const levelUpActive = useSyncExternalStore(hudState.subscribe, () => hudState.getField("levelUpActive"));
  const levelUpOptions = useSyncExternalStore(hudState.subscribe, () => hudState.getField("levelUpOptions"));
  const levelUpLevel = useSyncExternalStore(hudState.subscribe, () => hudState.getField("levelUpLevel"));
  const [selectedBuff, setSelectedBuff] = useState(0);

  useEffect(() => {
    if (levelUpActive) setSelectedBuff(0);
  }, [levelUpActive]);

  const confirmBuff = useCallback((index: number) => {
    hudState.dispatchLevelUpAction("select", index);
  }, []);

  // I key or ESC to close (but not during level-up forced view)
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (levelUpActive) {
        if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
          setSelectedBuff(s => Math.max(0, s - 1));
        } else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
          setSelectedBuff(s => Math.min(levelUpOptions.length - 1, s + 1));
        } else if (e.key === "Enter") {
          confirmBuff(selectedBuff);
        }
        return;
      }
      if (e.key === "i" || e.key === "I" || e.key === "Escape") {
        hudState.dispatchInventoryAction("close");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, levelUpActive, levelUpOptions.length, selectedBuff, confirmBuff]);

  if (!open) return null;

  const xpPct = xpNeeded > 0 ? Math.min(1, xp / xpNeeded) : 0;

  // Build 8 display slots (pad with empties)
  const displaySlots: InventorySlot[] = [];
  for (let i = 0; i < 8; i++) {
    displaySlots.push(slots[i] ?? { id: "", name: "", icon: "" });
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center pointer-events-auto"
      style={{ zIndex: 10000 }}
    >
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.92)", pointerEvents: "none" }} />

      <div
        className="relative"
        style={{
          width: "100%",
          maxWidth: 700,
          padding: "28px 36px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Level-up banner (if active) */}
        {levelUpActive && levelUpOptions.length > 0 && (
          <div
            style={{
              background: "rgba(255, 34, 68, 0.06)",
              border: "1px solid rgba(255, 34, 68, 0.3)",
              borderRadius: 6,
              padding: "16px 20px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{
              fontFamily: DISPLAY,
              fontSize: 36,
              color: "#ff2244",
              letterSpacing: "0.08em",
              textShadow: "0 0 12px rgba(255, 34, 68, 0.5)",
            }}>
              LEVEL {levelUpLevel}
            </span>
            <span style={{ fontFamily: BODY, fontSize: 16, color: "#aaaaaa" }}>
              Choose a buff
            </span>
            <div style={{ display: "flex", gap: 16 }}>
              {levelUpOptions.map((opt, i) => (
                <BuffCard
                  key={i}
                  option={opt}
                  focused={i === selectedBuff}
                  onClick={() => confirmBuff(i)}
                  onHover={() => setSelectedBuff(i)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Header — character + level + economy */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {/* Portrait */}
            <div style={{
              width: 56, height: 56,
              background: "rgba(255, 34, 68, 0.08)",
              border: "1px solid rgba(255, 34, 68, 0.25)",
              borderRadius: 4,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <img
                src={`/assets/sprites/${characterId}/rotations/south.png`}
                alt={characterName}
                style={{ width: 40, height: 40, imageRendering: "pixelated" }}
              />
            </div>
            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 28, color: "#ff2244", letterSpacing: "0.06em", lineHeight: 1 }}>
                {characterName}
              </div>
              <div style={{ fontFamily: BODY, fontSize: 15, color: "#888", marginTop: 2 }}>
                Level {level}
              </div>
            </div>
          </div>

          {/* Right: wave / kills / cash */}
          <div style={{ display: "flex", gap: 20, fontFamily: BODY, fontSize: 16, color: "#999" }}>
            <span>Wave <span style={{ color: "#ff4466" }}>{wave}</span></span>
            <span>Kills <span style={{ color: "#ff4466" }}>{kills}</span></span>
            <span>$ <span style={{ color: "#ffcc22" }}>{currency}</span></span>
          </div>
        </div>

        {/* XP Bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: BODY, fontSize: 14, color: "#ff4466", flexShrink: 0 }}>
            LVL {level}
          </span>
          <div style={{ flex: 1, height: 8, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
            <div style={{
              width: `${xpPct * 100}%`, height: "100%",
              background: "linear-gradient(90deg, #ff2244, #ff6644)",
              borderRadius: 4, transition: "width 200ms ease",
            }} />
          </div>
          <span style={{ fontFamily: BODY, fontSize: 13, color: "#666", flexShrink: 0 }}>
            {xp} / {xpNeeded} XP
          </span>
        </div>

        {/* Main content: two columns */}
        <div style={{ display: "flex", gap: 24 }}>

          {/* LEFT: Inventory Grid + Equipped */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Equipped weapon */}
            <div style={{
              background: "rgba(12, 6, 18, 0.7)",
              border: "1px solid rgba(255, 34, 68, 0.2)",
              borderRadius: 5,
              padding: "10px 14px",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <SectionLabel>EQUIPPED</SectionLabel>
              {equippedWeapon ? (
                <>
                  <img
                    src={WEAPON_ICONS[equippedWeapon] ?? ""}
                    alt=""
                    style={{ width: 32, height: 32, imageRendering: "pixelated" }}
                  />
                  <span style={{ fontFamily: BODY, fontSize: 16, color: "#e0daf0", flex: 1 }}>
                    {equippedWeapon.toUpperCase().replace("_", " ")}
                  </span>
                  <span style={{ fontFamily: BODY, fontSize: 14, color: "#888" }}>
                    {ammo}/{reserveAmmo}
                  </span>
                </>
              ) : (
                <span style={{ fontFamily: BODY, fontSize: 16, color: "#666" }}>Fists</span>
              )}
            </div>

            {/* 8-slot inventory grid (4x2) */}
            <div>
              <SectionLabel>INVENTORY</SectionLabel>
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
                marginTop: 8,
              }}>
                {displaySlots.map((slot, i) => (
                  <InventoryCell key={i} slot={slot} index={i} />
                ))}
              </div>
            </div>

            {/* Special items (axe, grenades) — don't count against slots */}
            <div style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
            }}>
              {hasAxe && (
                <SpecialItem icon="/assets/sprites/items/axe.png" name="Axe" />
              )}
              {grenadeCount > 0 && (
                <SpecialItem icon="/assets/sprites/items/grenade.png" name={`Grenade x${grenadeCount}`} />
              )}
            </div>
          </div>

          {/* RIGHT: Stats + Buffs */}
          <div style={{ width: 240, display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Stats */}
            <div style={{
              background: "rgba(12, 6, 18, 0.7)",
              border: "1px solid rgba(255, 34, 68, 0.15)",
              borderRadius: 5,
              padding: "12px 16px",
            }}>
              <SectionLabel>STATS</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                <StatRow label="Health" value={effective.maxHealth} />
                <StatRow label="Damage" value={effective.damage} />
                <StatRow label="Speed" value={effective.speed} />
                <StatRow label="Stamina" value={effective.maxStamina} />
                <StatRow label="Regen" value={effective.regen} suffix="/s" />
              </div>
            </div>

            {/* Buffs */}
            <div style={{
              background: "rgba(12, 6, 18, 0.7)",
              border: "1px solid rgba(255, 34, 68, 0.15)",
              borderRadius: 5,
              padding: "12px 16px",
              flex: 1,
              minHeight: 0,
            }}>
              <SectionLabel>BUFFS ({buffs.length})</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
                {buffs.length === 0 && (
                  <span style={{ fontFamily: BODY, fontSize: 14, color: "#444" }}>None</span>
                )}
                {buffs.map((b, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                      background: b.tier === "elite" ? "#ddaa22" : b.tier === "advanced" ? "#cc3333" : "#44aa44",
                    }} />
                    <span style={{ fontFamily: BODY, fontSize: 14, color: "#cccccc" }}>{b.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          textAlign: "center",
          fontFamily: BODY,
          fontSize: 13,
          color: "#555",
        }}>
          {levelUpActive ? "Select a buff to continue" : "Press I or ESC to close"}
        </div>
      </div>
    </div>
  );
});

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: BODY,
      fontSize: 12,
      color: "#ffffff",
      WebkitTextStroke: "0.5px rgba(180, 20, 20, 0.7)",
      paintOrder: "stroke fill" as const,
      letterSpacing: "0.12em",
      textTransform: "uppercase" as const,
    }}>
      {children}
    </span>
  );
}

function StatRow({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}>
      <span style={{ fontFamily: BODY, fontSize: 14, color: "#888" }}>{label}</span>
      <span style={{ fontFamily: BODY, fontSize: 16, color: "#eeeeee" }}>
        {value}{suffix || ""}
      </span>
    </div>
  );
}

function InventoryCell({ slot, index }: { slot: InventorySlot; index: number }) {
  const empty = !slot.id;

  return (
    <div
      style={{
        aspectRatio: "1",
        background: empty ? "rgba(255, 255, 255, 0.02)" : "rgba(255, 34, 68, 0.06)",
        border: empty ? "1px solid rgba(255, 255, 255, 0.06)" : "1px solid rgba(255, 34, 68, 0.25)",
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        padding: 4,
      }}
    >
      {empty ? (
        <span style={{ fontSize: 10, color: "#333", fontFamily: BODY }}>{index + 1}</span>
      ) : (
        <>
          {slot.icon && (
            <img
              src={slot.icon}
              alt=""
              style={{ width: 28, height: 28, imageRendering: "pixelated" }}
            />
          )}
          <span style={{
            fontFamily: BODY,
            fontSize: 10,
            color: "#cccccc",
            textAlign: "center",
            lineHeight: 1.1,
          }}>
            {slot.name}
          </span>
          {slot.count !== undefined && slot.count > 1 && (
            <span style={{ fontFamily: BODY, fontSize: 9, color: "#888" }}>
              x{slot.count}
            </span>
          )}
        </>
      )}
    </div>
  );
}

function SpecialItem({ icon, name }: { icon: string; name: string }) {
  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6,
      background: "rgba(255, 200, 50, 0.06)",
      border: "1px solid rgba(255, 200, 50, 0.2)",
      borderRadius: 4,
      padding: "4px 10px",
    }}>
      <img src={icon} alt="" style={{ width: 20, height: 20, imageRendering: "pixelated" }} />
      <span style={{ fontFamily: BODY, fontSize: 13, color: "#f5e6c8" }}>{name}</span>
    </div>
  );
}

function BuffCard({
  option, focused, onClick, onHover,
}: {
  option: BuffOption; focused: boolean; onClick: () => void; onHover: () => void;
}) {
  const tierColors: Record<string, { border: string; glow: string }> = {
    basic: { border: "#44aa44", glow: "rgba(68, 170, 68, 0.3)" },
    advanced: { border: "#cc3333", glow: "rgba(204, 51, 51, 0.3)" },
    elite: { border: "#ddaa22", glow: "rgba(221, 170, 34, 0.4)" },
  };
  const tc = tierColors[option.tier] ?? tierColors.basic;

  return (
    <div
      style={{
        width: 180,
        padding: "14px 12px",
        cursor: "pointer",
        background: "rgba(10, 8, 16, 0.95)",
        border: `2px solid ${focused ? tc.border : "#333344"}`,
        borderRadius: 5,
        boxShadow: focused ? `0 0 16px ${tc.glow}` : "none",
        transition: "border-color 120ms ease, box-shadow 120ms ease",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        textAlign: "center",
      }}
      onMouseEnter={onHover}
      onClick={onClick}
    >
      <span style={{
        fontFamily: BODY,
        fontSize: 16,
        color: "#ffffff",
        WebkitTextStroke: "0.5px rgba(180, 20, 20, 0.7)",
        paintOrder: "stroke fill" as const,
      }}>
        {option.name}
      </span>
      <span style={{ fontFamily: BODY, fontSize: 13, color: "#bbbbbb" }}>
        {option.desc}
      </span>
    </div>
  );
}
