"use client";

import { memo } from "react";

const BODY = "var(--font-special-elite), 'Special Elite', serif";

export const ControlsHint = memo(function ControlsHint() {
  return (
    <div
      className="absolute flex justify-center"
      style={{ bottom: 8, left: 0, right: 0 }}
    >
      <span style={{ fontFamily: BODY, fontSize: 14, color: "#444455" }}>
        WASD move | CLICK/SPACE punch | RIGHT-CLICK/F use item | R reload | Q ability | G grenade | B shop
      </span>
    </div>
  );
});
