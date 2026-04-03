"use client";

import { memo, useSyncExternalStore, useEffect, useState, Fragment } from "react";
import { hudState } from "@/game/HUDState";
import { BALANCE } from "@/game/data/balance";

const BODY = "var(--font-special-elite), 'Special Elite', serif";
const DISPLAY = "ChainsawCarnage, HorrorPixel, monospace";

const WEAPON_ICONS: Record<string, string> = {
  pistol: "/assets/sprites/items/pistol.png",
  shotgun: "/assets/sprites/items/shotgun.png",
  smg: "/assets/sprites/items/smg.png",
};

const ITEM_ICONS: Record<string, string> = {
  ...WEAPON_ICONS,
  barricade: "/assets/sprites/items/trap-barricade.png",
  landmine: "/assets/sprites/items/trap-landmine.png",
  fists: "",
};

export const StatsScreen = memo(function StatsScreen() {
  const open = useSyncExternalStore(hudState.subscribe, () => hudState.getField("statsOpen"));
  const paused = useSyncExternalStore(hudState.subscribe, () => hudState.getField("paused"));
  const characterId = useSyncExternalStore(hudState.subscribe, () => hudState.getField("characterId"));
  const characterName = useSyncExternalStore(hudState.subscribe, () => hudState.getField("characterName"));
  const className = useSyncExternalStore(hudState.subscribe, () => hudState.getField("statsClassName"));
  const level = useSyncExternalStore(hudState.subscribe, () => hudState.getField("level"));
  const effective = useSyncExternalStore(hudState.subscribe, () => hudState.getField("statsEffective"));
  const base = useSyncExternalStore(hudState.subscribe, () => hudState.getField("statsBase"));
  const buffs = useSyncExternalStore(hudState.subscribe, () => hudState.getField("statsBuffs"));
  const xp = useSyncExternalStore(hudState.subscribe, () => hudState.getField("statsXp"));
  const xpNeeded = useSyncExternalStore(hudState.subscribe, () => hudState.getField("statsXpNeeded"));
  const equippedWeapon = useSyncExternalStore(hudState.subscribe, () => hudState.getField("equippedWeapon"));
  const ammo = useSyncExternalStore(hudState.subscribe, () => hudState.getField("ammo"));
  const maxAmmo = useSyncExternalStore(hudState.subscribe, () => hudState.getField("maxAmmo"));
  const activeSlot = useSyncExternalStore(hudState.subscribe, () => hudState.getField("activeSlot"));
  const barricadeCount = useSyncExternalStore(hudState.subscribe, () => hudState.getField("barricadeCount"));
  const mineCount = useSyncExternalStore(hudState.subscribe, () => hudState.getField("mineCount"));
  const currency = useSyncExternalStore(hudState.subscribe, () => hudState.getField("currency"));
  const kills = useSyncExternalStore(hudState.subscribe, () => hudState.getField("kills"));
  const wave = useSyncExternalStore(hudState.subscribe, () => hudState.getField("wave"));
  const abilityName = useSyncExternalStore(hudState.subscribe, () => hudState.getField("abilityName"));
  const abilityCooldown = useSyncExternalStore(hudState.subscribe, () => hudState.getField("abilityMaxCooldown"));

  // TAB to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Tab") {
        e.preventDefault();
        hudState.dispatchPauseAction("closeStats");
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open]);

  if (!open || !paused) return null;

  const xpPct = xpNeeded > 0 ? Math.min(1, xp / xpNeeded) : 0;

  // Build inventory slots
  const invSlots: InvSlotData[] = [
    { id: "fists", name: "Fists", icon: null, active: activeSlot === 0, slot: 0 },
  ];
  if (equippedWeapon) {
    invSlots.push({
      id: equippedWeapon,
      name: BALANCE.weapons[equippedWeapon as keyof typeof BALANCE.weapons]?.name || equippedWeapon,
      icon: WEAPON_ICONS[equippedWeapon] || null,
      active: activeSlot === 1,
      slot: 1,
      count: `${ammo}/${maxAmmo} +${hudState.getField("reserveAmmo")}`,
    });
  }
  if (barricadeCount > 0) {
    invSlots.push({ id: "barricade", name: "Barricade", icon: ITEM_ICONS.barricade, active: activeSlot === 2, slot: 2, count: `x${barricadeCount}` });
  }
  if (mineCount > 0) {
    invSlots.push({ id: "landmine", name: "Landmine", icon: ITEM_ICONS.landmine, active: activeSlot === 3, slot: 3, count: `x${mineCount}` });
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center pointer-events-auto"
      style={{ zIndex: 10000 }}
    >
      {/* Background */}
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.94)", pointerEvents: "none" }} />

      {/* Content container */}
      <div
        className="relative"
        style={{
          width: "100%",
          height: "100%",
          maxWidth: 1100,
          padding: "32px 40px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ===== HEADER ===== */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 28,
          borderBottom: "2px solid rgba(255, 34, 68, 0.25)",
          paddingBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* Portrait */}
            <div style={{
              width: 80, height: 80,
              backgroundImage: "url(/assets/sprites/ui/horror/slot-dark-inactive.png)",
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <img
                src={`/assets/sprites/${characterId}/rotations/south.png`}
                alt={characterName}
                style={{ width: 60, height: 60, objectFit: "contain", imageRendering: "pixelated" }}
              />
            </div>
            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 36, color: "#ff2244", letterSpacing: "0.08em", lineHeight: 1 }}>
                {characterName}
              </div>
              <div style={{ fontFamily: BODY, fontSize: 18, color: "#888", marginTop: 4 }}>
                {className}
              </div>
            </div>
          </div>

          {/* Right side: wave / kills / cash */}
          <div style={{ display: "flex", gap: 32, fontFamily: BODY, fontSize: 20, color: "#999" }}>
            <span>Wave <span style={{ color: "#ff4466", fontWeight: "bold" }}>{wave}</span></span>
            <span>Kills <span style={{ color: "#ff4466", fontWeight: "bold" }}>{kills}</span></span>
            <span>$ <span style={{ color: "#ffcc22", fontWeight: "bold" }}>{currency}</span></span>
          </div>
        </div>

        {/* ===== LEVEL / XP BAR ===== */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 22, color: "#ff4466", flexShrink: 0 }}>
            LVL {level}
          </span>
          <div style={{ flex: 1, height: 10, background: "rgba(255,255,255,0.06)", borderRadius: 5, overflow: "hidden" }}>
            <div style={{
              width: `${xpPct * 100}%`, height: "100%",
              background: "linear-gradient(90deg, #ff2244, #ff6644)",
              borderRadius: 5, transition: "width 200ms ease",
            }} />
          </div>
          <span style={{ fontFamily: BODY, fontSize: 16, color: "#666", flexShrink: 0 }}>
            {xp} / {xpNeeded} XP
          </span>
        </div>

        {/* ===== MAIN TWO-COLUMN LAYOUT ===== */}
        <div style={{ display: "flex", gap: 28, flex: 1, minHeight: 0 }}>

          {/* ===== LEFT: STATS + BUFFS ===== */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Player Stats */}
            <Panel>
              <SectionLabel>PLAYER STATS</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 32px" }}>
                <StatRow label="Health" current={effective.maxHealth} base={base.hp} />
                <StatRow label="Stamina" current={effective.maxStamina} base={base.stamina} />
                <StatRow label="Damage" current={effective.damage} base={base.damage} />
                <StatRow label="Speed" current={effective.speed} base={base.speed} />
                <StatRow label="Regen" current={effective.regen} base={base.regen} suffix="/s" />
                <StatRow label="Crit" current={Math.round(effective.critChance * 100)} base={Math.round(base.critChance * 100)} suffix="%" />
                {effective.killBonusPct > 0 && (
                  <StatRow label="Kill $" current={Math.round(effective.killBonusPct * 100)} base={0} suffix="%" />
                )}
              </div>
            </Panel>

            {/* Ability */}
            <Panel>
              <SectionLabel>ABILITY</SectionLabel>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: BODY, fontSize: 20, color: "#dddddd" }}>{abilityName}</span>
                <span style={{ fontFamily: BODY, fontSize: 16, color: "#777" }}>{abilityCooldown}s cooldown</span>
              </div>
            </Panel>

            {/* Buffs */}
            <Panel style={{ flex: 1, minHeight: 0 }}>
              <SectionLabel>BUFFS ({buffs.length})</SectionLabel>
              <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {buffs.length === 0 && (
                  <div style={{ fontFamily: BODY, fontSize: 16, color: "#444" }}>No buffs yet. Level up to choose buffs.</div>
                )}
                {buffs.map((b, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: 5, flexShrink: 0,
                      background: b.tier === "elite" ? "#ddaa22" : b.tier === "advanced" ? "#cc3333" : "#44aa44",
                      boxShadow: b.tier === "elite" ? "0 0 6px rgba(221,170,34,0.5)" : "none",
                    }} />
                    <span style={{ fontFamily: BODY, fontSize: 17, color: "#cccccc" }}>{b.name}</span>
                    <span style={{ fontFamily: BODY, fontSize: 13, color: "#555" }}>({b.category})</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>

          {/* ===== RIGHT: INVENTORY + ITEM DETAIL ===== */}
          <div style={{ width: 380, flexShrink: 0, display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Inventory */}
            <Panel>
              <SectionLabel>INVENTORY</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {invSlots.map((slot) => (
                  <InvSlot key={slot.id} data={slot} />
                ))}
                {/* Empty slots */}
                {Array.from({ length: Math.max(0, 4 - invSlots.length) }).map((_, i) => (
                  <EmptySlot key={`empty-${i}`} />
                ))}
              </div>
            </Panel>

            {/* Equipped Item Detail */}
            <Panel style={{ flex: 1, minHeight: 0 }}>
              <SectionLabel>EQUIPPED</SectionLabel>
              <ItemDetail
                activeSlot={activeSlot}
                equippedWeapon={equippedWeapon}
                ammo={ammo}
                maxAmmo={maxAmmo}
                barricadeCount={barricadeCount}
                mineCount={mineCount}
                effectiveDamage={effective.damage}
              />
            </Panel>
          </div>
        </div>

        {/* Footer */}
        <div style={{
          textAlign: "center",
          fontFamily: BODY,
          fontSize: 15,
          color: "#555",
          marginTop: 16,
        }}>
          Press TAB or ESC to close
        </div>
      </div>
    </div>
  );
});

// ====== Sub-components ======

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "rgba(12, 6, 18, 0.88)",
      border: "1px solid rgba(255, 34, 68, 0.18)",
      borderRadius: 6,
      padding: "18px 22px",
      display: "flex",
      flexDirection: "column",
      ...style,
    }}>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: DISPLAY,
      fontSize: 18,
      color: "#ff4466",
      letterSpacing: "0.12em",
      marginBottom: 12,
    }}>
      {children}
    </div>
  );
}

function StatRow({ label, current, base, suffix }: {
  label: string; current: number; base: number; suffix?: string;
}) {
  const s = suffix || "";
  const buffed = current > base;
  const debuffed = current < base;
  const diff = current - base;

  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "4px 0" }}>
      <span style={{ fontFamily: BODY, fontSize: 18, color: "#888" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{
          fontFamily: BODY, fontSize: 22, fontWeight: "bold",
          color: buffed ? "#44ee44" : debuffed ? "#ee4444" : "#eeeeee",
        }}>
          {current}{s}
        </span>
        {buffed && (
          <span style={{ fontFamily: BODY, fontSize: 14, color: "#44ee44" }}>
            +{diff}{s}
          </span>
        )}
        {debuffed && (
          <span style={{ fontFamily: BODY, fontSize: 14, color: "#ee4444" }}>
            {diff}{s}
          </span>
        )}
      </div>
    </div>
  );
}

interface InvSlotData {
  id: string;
  name: string;
  icon: string | null;
  active: boolean;
  slot: number;
  count?: string;
}

function InvSlot({ data }: { data: InvSlotData }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 12px",
      background: data.active ? "rgba(255, 34, 68, 0.1)" : "rgba(255,255,255,0.02)",
      border: data.active ? "1px solid rgba(255, 34, 68, 0.35)" : "1px solid rgba(255,255,255,0.06)",
      borderRadius: 5,
    }}>
      {/* Icon */}
      <div style={{
        width: 48, height: 48, flexShrink: 0,
        backgroundImage: data.active
          ? "url(/assets/sprites/ui/horror/slot-dark-active.png)"
          : "url(/assets/sprites/ui/horror/slot-dark-inactive.png)",
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {data.icon ? (
          <img src={data.icon} alt="" style={{ width: 34, height: 34, objectFit: "contain", imageRendering: "pixelated" }} />
        ) : (
          <span style={{ fontSize: 24, lineHeight: 1 }}>&#9994;</span>
        )}
      </div>

      {/* Name + count */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: BODY, fontSize: 18,
          color: data.active ? "#ff4466" : "#cccccc",
        }}>
          {data.name}
        </div>
        {data.count && (
          <div style={{ fontFamily: BODY, fontSize: 14, color: "#777" }}>{data.count}</div>
        )}
      </div>

      {data.active && (
        <div style={{
          fontFamily: DISPLAY, fontSize: 11,
          color: "#ff4466", border: "1px solid rgba(255, 34, 68, 0.3)",
          borderRadius: 3, padding: "2px 8px",
          letterSpacing: "0.08em",
        }}>
          ACTIVE
        </div>
      )}
    </div>
  );
}

function EmptySlot() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "10px 12px",
      border: "1px solid rgba(255,255,255,0.03)",
      borderRadius: 5,
      height: 70,
    }}>
      <div style={{
        width: 48, height: 48, flexShrink: 0,
        backgroundImage: "url(/assets/sprites/ui/horror/slot-dark-inactive.png)",
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
        opacity: 0.3,
      }} />
      <span style={{ fontFamily: BODY, fontSize: 15, color: "#333" }}>Empty</span>
    </div>
  );
}

function ItemDetail({ activeSlot, equippedWeapon, ammo, maxAmmo, barricadeCount, mineCount, effectiveDamage }: {
  activeSlot: number; equippedWeapon: string | null;
  ammo: number; maxAmmo: number;
  barricadeCount: number; mineCount: number; effectiveDamage: number;
}) {
  // Show detail for currently active slot
  if (activeSlot === 0) {
    return (
      <div style={{ display: "flex", gap: 16 }}>
        <ItemIcon fist />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <ItemName>Fists</ItemName>
          <EquipStat label="Damage" value={`${effectiveDamage}`} />
          <EquipStat label="Range" value={`${BALANCE.punch.range}px`} />
          <EquipStat label="Arc" value={`${BALANCE.punch.arc}deg`} />
          <EquipStat label="Knockback" value={`${BALANCE.punch.knockback}`} />
          <EquipStat label="Stamina" value={`${BALANCE.stamina.punchCost}`} />
        </div>
      </div>
    );
  }

  if (activeSlot === 1 && equippedWeapon) {
    const wDef = BALANCE.weapons[equippedWeapon as keyof typeof BALANCE.weapons];
    if (!wDef) return null;
    return (
      <div style={{ display: "flex", gap: 16 }}>
        <ItemIcon icon={WEAPON_ICONS[equippedWeapon]} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <ItemName>{wDef.name}</ItemName>
          <EquipStat label="Damage" value={`${wDef.damage}${wDef.pellets > 1 ? ` x${wDef.pellets}` : ""}`} />
          <EquipStat label="Fire Rate" value={`${Math.round(1000 / wDef.fireRate * 10) / 10}/s`} />
          <EquipStat label="Range" value={`${wDef.range}px`} />
          {wDef.spread > 0 && <EquipStat label="Spread" value={`${wDef.spread}deg`} />}
          <EquipStat label="Ammo" value={`${ammo} / ${maxAmmo} +${hudState.getField("reserveAmmo")}`} />
          <EquipStat label="Reload" value={`${(wDef as any).reloadMs / 1000}s`} />
          {(wDef as any).knockback && <EquipStat label="Knockback" value={`${(wDef as any).knockback}`} />}
        </div>
      </div>
    );
  }

  if (activeSlot === 2 && barricadeCount > 0) {
    return (
      <div style={{ display: "flex", gap: 16 }}>
        <ItemIcon icon={ITEM_ICONS.barricade} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <ItemName>Barricade</ItemName>
          <EquipStat label="HP" value={`${BALANCE.traps.barricade.hp}`} />
          <EquipStat label="Count" value={`${barricadeCount}`} />
          <EquipStat label="Max" value={`${BALANCE.traps.maxPerType}`} />
        </div>
      </div>
    );
  }

  if (activeSlot === 3 && mineCount > 0) {
    return (
      <div style={{ display: "flex", gap: 16 }}>
        <ItemIcon icon={ITEM_ICONS.landmine} />
        <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
          <ItemName>Landmine</ItemName>
          <EquipStat label="Damage" value={`${BALANCE.traps.landmine.damage}`} />
          <EquipStat label="Radius" value={`${BALANCE.traps.landmine.radius}px`} />
          <EquipStat label="Count" value={`${mineCount}`} />
          <EquipStat label="Max" value={`${BALANCE.traps.maxPerType}`} />
        </div>
      </div>
    );
  }

  return <div style={{ fontFamily: BODY, fontSize: 16, color: "#444" }}>No item equipped</div>;
}

function ItemIcon({ icon, fist }: { icon?: string | null; fist?: boolean }) {
  return (
    <div style={{
      width: 72, height: 72, flexShrink: 0,
      backgroundImage: "url(/assets/sprites/ui/horror/slot-dark-active.png)",
      backgroundSize: "100% 100%",
      imageRendering: "pixelated",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {fist ? (
        <span style={{ fontSize: 36, lineHeight: 1 }}>&#9994;</span>
      ) : icon ? (
        <img src={icon} alt="" style={{ width: 50, height: 50, objectFit: "contain", imageRendering: "pixelated" }} />
      ) : null}
    </div>
  );
}

function ItemName({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: DISPLAY, fontSize: 22, color: "#ffffff", letterSpacing: "0.04em", marginBottom: 2 }}>{children}</span>
  );
}

function EquipStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontFamily: BODY, fontSize: 15, color: "#666" }}>{label}</span>
      <span style={{ fontFamily: BODY, fontSize: 17, color: "#cccccc" }}>{value}</span>
    </div>
  );
}
