"use client";

import { memo, useSyncExternalStore, useEffect, useState } from "react";
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

  const [selectedInvSlot, setSelectedInvSlot] = useState(0);

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
    invSlots.push({
      id: "barricade",
      name: "Barricade",
      icon: ITEM_ICONS.barricade,
      active: activeSlot === 2,
      slot: 2,
      count: `x${barricadeCount}`,
    });
  }
  if (mineCount > 0) {
    invSlots.push({
      id: "landmine",
      name: "Landmine",
      icon: ITEM_ICONS.landmine,
      active: activeSlot === 3,
      slot: 3,
      count: `x${mineCount}`,
    });
  }

  const selectedItem = invSlots[selectedInvSlot] || invSlots[0];

  return (
    <div
      className="absolute inset-0 flex items-center justify-center pointer-events-auto"
      style={{ zIndex: 31 }}
    >
      {/* Background */}
      <div className="absolute inset-0" style={{ background: "rgba(0, 0, 0, 0.92)" }} />

      {/* Full-screen content */}
      <div
        className="relative"
        style={{
          width: "100%",
          height: "100%",
          padding: "24px 32px",
          display: "flex",
          flexDirection: "column",
          maxWidth: 960,
        }}
      >
        {/* Header bar */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}>
          <span style={{
            fontFamily: DISPLAY,
            fontSize: 48,
            color: "#ff2244",
            letterSpacing: "0.1em",
            textShadow: "0 0 14px rgba(255, 34, 68, 0.4)",
          }}>
            STATS
          </span>
          <div style={{ display: "flex", gap: 24, fontFamily: BODY, fontSize: 14, color: "#888" }}>
            <span>Wave <span style={{ color: "#ff4466" }}>{wave}</span></span>
            <span>Kills <span style={{ color: "#ff4466" }}>{kills}</span></span>
            <span>$ <span style={{ color: "#ffcc22" }}>{currency}</span></span>
          </div>
        </div>

        {/* Main three-column layout */}
        <div style={{ display: "flex", gap: 24, flex: 1, minHeight: 0 }}>

          {/* ===== LEFT COLUMN: Character ===== */}
          <Panel style={{ width: 220, flexShrink: 0 }}>
            {/* Portrait */}
            <div style={{
              width: 120, height: 120,
              margin: "0 auto 12px",
              backgroundImage: "url(/assets/sprites/ui/horror/slot-dark-inactive.png)",
              backgroundSize: "100% 100%",
              imageRendering: "pixelated",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <img
                src={`/assets/sprites/${characterId}/rotations/south.png`}
                alt={characterName}
                style={{ width: 90, height: 90, objectFit: "contain", imageRendering: "pixelated" }}
              />
            </div>

            <div style={{ textAlign: "center" }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 22, color: "#fff", letterSpacing: "0.04em" }}>
                {characterName}
              </div>
              <div style={{ fontFamily: BODY, fontSize: 13, color: "#888", marginBottom: 10 }}>
                {className}
              </div>
            </div>

            {/* Level + XP */}
            <div style={{ fontFamily: BODY, fontSize: 14, color: "#ff4466", textAlign: "center", marginBottom: 4 }}>
              Level {level}
            </div>
            <div style={{ height: 6, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", marginBottom: 3 }}>
              <div style={{
                width: `${xpPct * 100}%`, height: "100%",
                background: "linear-gradient(90deg, #ff2244, #ff6644)",
                borderRadius: 3, transition: "width 200ms ease",
              }} />
            </div>
            <div style={{ fontFamily: BODY, fontSize: 10, color: "#555", textAlign: "center", marginBottom: 14 }}>
              {xp} / {xpNeeded} XP
            </div>

            <Divider />

            {/* Ability */}
            <SectionLabel>ABILITY</SectionLabel>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontFamily: BODY, fontSize: 14, color: "#dddddd" }}>{abilityName}</span>
              <span style={{ fontFamily: BODY, fontSize: 11, color: "#777" }}>{abilityCooldown}s cd</span>
            </div>

            <Divider />

            {/* Buffs */}
            <SectionLabel>BUFFS ({buffs.length})</SectionLabel>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
              {buffs.length === 0 && (
                <div style={{ fontFamily: BODY, fontSize: 12, color: "#444", textAlign: "center" }}>None yet</div>
              )}
              {buffs.map((b, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: 3, flexShrink: 0,
                    background: b.tier === "elite" ? "#ddaa22" : b.tier === "advanced" ? "#cc3333" : "#44aa44",
                  }} />
                  <span style={{ fontFamily: BODY, fontSize: 12, color: "#bbb" }}>{b.name}</span>
                </div>
              ))}
            </div>
          </Panel>

          {/* ===== CENTER COLUMN: Player Stats ===== */}
          <Panel style={{ flex: 1 }}>
            <SectionLabel>PLAYER STATS</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 16 }}>
              <StatRow label="Health" icon="/assets/sprites/ui/horror/icon-heart.png" current={effective.maxHealth} base={base.hp} unit="" />
              <StatRow label="Stamina" icon="/assets/sprites/ui/horror/icon-stamina.png" current={effective.maxStamina} base={base.stamina} unit="" />
              <StatRow label="Damage" icon="/assets/sprites/ui/horror/icon-skull.png" current={effective.damage} base={base.damage} unit="" />
              <StatRow label="Speed" icon={null} current={effective.speed} base={base.speed} unit="" />
              <StatRow label="Regen" icon={null} current={effective.regen} base={base.regen} unit="/s" />
              <StatRow label="Crit" icon={null} current={Math.round(effective.critChance * 100)} base={Math.round(base.critChance * 100)} unit="%" />
              {effective.killBonusPct > 0 && (
                <StatRow label="Kill $" icon="/assets/sprites/ui/horror/icon-currency.png" current={Math.round(effective.killBonusPct * 100)} base={0} unit="%" />
              )}
            </div>

            <Divider />

            {/* Selected item detail */}
            <SectionLabel>ITEM DETAIL</SectionLabel>
            <ItemDetail item={selectedItem} ammo={ammo} maxAmmo={maxAmmo} barricadeCount={barricadeCount} mineCount={mineCount} effectiveDamage={effective.damage} />
          </Panel>

          {/* ===== RIGHT COLUMN: Inventory ===== */}
          <Panel style={{ width: 240, flexShrink: 0 }}>
            <SectionLabel>INVENTORY</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {invSlots.map((slot, i) => (
                <InvSlot
                  key={slot.id}
                  data={slot}
                  selected={selectedInvSlot === i}
                  onClick={() => setSelectedInvSlot(i)}
                />
              ))}
              {/* Empty slots to fill visual grid */}
              {Array.from({ length: Math.max(0, 6 - invSlots.length) }).map((_, i) => (
                <EmptySlot key={`empty-${i}`} />
              ))}
            </div>

            <Divider />

            {/* Slot legend */}
            <SectionLabel>HOTBAR</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <HotbarHint label="0" desc="Fists" available />
              <HotbarHint label="Q / E" desc="Cycle slots" available />
              <HotbarHint label="1" desc={equippedWeapon ? BALANCE.weapons[equippedWeapon as keyof typeof BALANCE.weapons]?.name || "Weapon" : "No weapon"} available={!!equippedWeapon} />
              <HotbarHint label="2" desc="Barricade" available={barricadeCount > 0} />
              <HotbarHint label="3" desc="Landmine" available={mineCount > 0} />
            </div>
          </Panel>
        </div>

        {/* Footer */}
        <div style={{
          textAlign: "center",
          fontFamily: BODY,
          fontSize: 12,
          color: "#444",
          marginTop: 12,
        }}>
          TAB or ESC to close
        </div>
      </div>
    </div>
  );
});

// ====== Sub-components ======

function Panel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: "rgba(12, 6, 18, 0.85)",
      border: "1px solid rgba(255, 34, 68, 0.15)",
      borderRadius: 6,
      padding: "16px 18px",
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
      fontSize: 14,
      color: "#ff4466",
      letterSpacing: "0.12em",
      marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div style={{
      height: 1,
      background: "linear-gradient(90deg, transparent, rgba(255, 34, 68, 0.2), transparent)",
      margin: "12px 0",
    }} />
  );
}

function StatRow({ label, icon, current, base, unit }: {
  label: string; icon: string | null; current: number; base: number; unit: string;
}) {
  const buffed = current > base;
  const debuffed = current < base;

  return (
    <div style={{ display: "flex", alignItems: "center", height: 26, gap: 8 }}>
      <div style={{ width: 18, height: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icon && <img src={icon} alt="" style={{ width: 16, height: 16, imageRendering: "pixelated", opacity: 0.7 }} />}
      </div>
      <span style={{ fontFamily: BODY, fontSize: 14, color: "#999aab", width: 70, flexShrink: 0 }}>{label}</span>
      <span style={{
        fontFamily: BODY, fontSize: 16, fontWeight: "bold",
        color: buffed ? "#44dd44" : debuffed ? "#dd4444" : "#dddddd",
        width: 50, textAlign: "right", flexShrink: 0,
      }}>
        {current}{unit}
      </span>
      <span style={{ fontFamily: BODY, fontSize: 11, color: "#444", flexShrink: 0 }}>/ {base}{unit}</span>
      {buffed && <span style={{ fontFamily: BODY, fontSize: 11, color: "#44dd44" }}>+{current - base}{unit}</span>}
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

function InvSlot({ data, selected, onClick }: { data: InvSlotData; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 10px",
        background: selected
          ? "rgba(255, 34, 68, 0.12)"
          : "rgba(255, 255, 255, 0.02)",
        border: selected
          ? "1px solid rgba(255, 34, 68, 0.4)"
          : "1px solid rgba(255, 255, 255, 0.06)",
        borderRadius: 4,
        cursor: "pointer",
        transition: "all 100ms ease",
        textAlign: "left",
      }}
    >
      {/* Icon */}
      <div style={{
        width: 40, height: 40, flexShrink: 0,
        backgroundImage: data.active
          ? "url(/assets/sprites/ui/horror/slot-dark-active.png)"
          : "url(/assets/sprites/ui/horror/slot-dark-inactive.png)",
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {data.icon ? (
          <img src={data.icon} alt="" style={{ width: 28, height: 28, objectFit: "contain", imageRendering: "pixelated" }} />
        ) : (
          <span style={{ fontSize: 20, lineHeight: 1 }}>&#9994;</span>
        )}
      </div>

      {/* Name + count */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: BODY, fontSize: 14,
          color: data.active ? "#ff4466" : "#cccccc",
        }}>
          {data.name}
        </div>
        {data.count && (
          <div style={{ fontFamily: BODY, fontSize: 11, color: "#777" }}>{data.count}</div>
        )}
      </div>

      {/* Active badge */}
      {data.active && (
        <div style={{
          fontFamily: BODY, fontSize: 9,
          color: "#ff4466", border: "1px solid rgba(255, 34, 68, 0.3)",
          borderRadius: 3, padding: "1px 5px",
          letterSpacing: "0.05em",
        }}>
          ACTIVE
        </div>
      )}
    </button>
  );
}

function EmptySlot() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "8px 10px",
      border: "1px solid rgba(255, 255, 255, 0.03)",
      borderRadius: 4,
      height: 58,
    }}>
      <div style={{
        width: 40, height: 40, flexShrink: 0,
        backgroundImage: "url(/assets/sprites/ui/horror/slot-dark-inactive.png)",
        backgroundSize: "100% 100%",
        imageRendering: "pixelated",
        opacity: 0.3,
      }} />
      <span style={{ fontFamily: BODY, fontSize: 12, color: "#333" }}>Empty</span>
    </div>
  );
}

function HotbarHint({ label, desc, available }: { label: string; desc: string; available: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: available ? 1 : 0.35 }}>
      <span style={{
        fontFamily: DISPLAY, fontSize: 12, color: "#ff4466",
        width: 40, textAlign: "right", flexShrink: 0,
      }}>{label}</span>
      <span style={{ fontFamily: BODY, fontSize: 12, color: "#999" }}>{desc}</span>
    </div>
  );
}

function ItemDetail({ item, ammo, maxAmmo, barricadeCount, mineCount, effectiveDamage }: {
  item: InvSlotData; ammo: number; maxAmmo: number;
  barricadeCount: number; mineCount: number; effectiveDamage: number;
}) {
  if (item.id === "fists") {
    return (
      <div style={{ display: "flex", gap: 16 }}>
        <ItemIcon icon={null} fist />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <ItemName>Fists</ItemName>
          <EquipStat label="Damage" value={`${effectiveDamage}`} />
          <EquipStat label="Range" value={`${BALANCE.punch.range}px`} />
          <EquipStat label="Arc" value={`${BALANCE.punch.arc}deg`} />
          <EquipStat label="Knockback" value={`${BALANCE.punch.knockback}`} />
          <EquipStat label="Stamina Cost" value={`${BALANCE.stamina.punchCost}`} />
        </div>
      </div>
    );
  }

  if (item.slot === 1) {
    const wDef = BALANCE.weapons[item.id as keyof typeof BALANCE.weapons];
    if (!wDef) return null;
    return (
      <div style={{ display: "flex", gap: 16 }}>
        <ItemIcon icon={WEAPON_ICONS[item.id]} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <ItemName>{wDef.name}</ItemName>
          <EquipStat label="Damage" value={`${wDef.damage}${wDef.pellets > 1 ? ` x${wDef.pellets} (${wDef.damage * wDef.pellets} max)` : ""}`} />
          <EquipStat label="Fire Rate" value={`${Math.round(1000 / wDef.fireRate * 10) / 10}/s`} />
          <EquipStat label="Range" value={`${wDef.range}px`} />
          {wDef.spread > 0 && <EquipStat label="Spread" value={`${wDef.spread}deg`} />}
          <EquipStat label="Magazine" value={`${ammo} / ${maxAmmo}`} />
          <EquipStat label="Reserve" value={`${(hudState.getField("reserveAmmo") as number)}`} />
          <EquipStat label="Reload" value={`${(wDef as any).reloadMs / 1000}s`} />
          <EquipStat label="Speed" value={`${wDef.speed}px/s`} />
          {(wDef as any).knockback && <EquipStat label="Knockback" value={`${(wDef as any).knockback}`} />}
          <EquipStat label="Auto" value={wDef.auto ? "Yes" : "No"} />
        </div>
      </div>
    );
  }

  if (item.id === "barricade") {
    return (
      <div style={{ display: "flex", gap: 16 }}>
        <ItemIcon icon={ITEM_ICONS.barricade} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <ItemName>Barricade</ItemName>
          <EquipStat label="HP" value={`${BALANCE.traps.barricade.hp}`} />
          <EquipStat label="Count" value={`${barricadeCount}`} />
          <EquipStat label="Place Range" value={`${BALANCE.traps.placementRange}px`} />
          <EquipStat label="Max Placed" value={`${BALANCE.traps.maxPerType}`} />
        </div>
      </div>
    );
  }

  if (item.id === "landmine") {
    return (
      <div style={{ display: "flex", gap: 16 }}>
        <ItemIcon icon={ITEM_ICONS.landmine} />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <ItemName>Landmine</ItemName>
          <EquipStat label="Damage" value={`${BALANCE.traps.landmine.damage}`} />
          <EquipStat label="Blast Radius" value={`${BALANCE.traps.landmine.radius}px`} />
          <EquipStat label="Count" value={`${mineCount}`} />
          <EquipStat label="Max Placed" value={`${BALANCE.traps.maxPerType}`} />
        </div>
      </div>
    );
  }

  return null;
}

function ItemIcon({ icon, fist }: { icon?: string | null; fist?: boolean }) {
  return (
    <div style={{
      width: 64, height: 64, flexShrink: 0,
      backgroundImage: "url(/assets/sprites/ui/horror/slot-dark-active.png)",
      backgroundSize: "100% 100%",
      imageRendering: "pixelated",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {fist ? (
        <span style={{ fontSize: 32, lineHeight: 1 }}>&#9994;</span>
      ) : icon ? (
        <img src={icon} alt="" style={{ width: 44, height: 44, objectFit: "contain", imageRendering: "pixelated" }} />
      ) : null}
    </div>
  );
}

function ItemName({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: BODY, fontSize: 20, color: "#ffffff", marginBottom: 2 }}>{children}</span>
  );
}

function EquipStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      <span style={{ fontFamily: BODY, fontSize: 12, color: "#666", width: 90, flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: BODY, fontSize: 13, color: "#cccccc" }}>{value}</span>
    </div>
  );
}
