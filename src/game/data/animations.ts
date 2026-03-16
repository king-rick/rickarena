import { DIRECTIONS, Direction } from "./characters";

// Which characters have which animations
export const CHARACTER_ANIMATIONS: Record<
  string,
  { type: string; frames: number }[]
> = {
  rick: [
    { type: "walk", frames: 8 },
    { type: "breathing-idle", frames: 4 },
    { type: "cross-punch", frames: 6 },
    { type: "taking-punch", frames: 6 },
    { type: "falling-back-death", frames: 6 },
  ],
  dan: [
    { type: "walk", frames: 6 },
    { type: "breathing-idle", frames: 4 },
    { type: "cross-punch", frames: 6 },
    { type: "taking-punch", frames: 6 },
    { type: "falling-back-death", frames: 6 },
  ],
  mason: [
    { type: "walk", frames: 6 },
    { type: "breathing-idle", frames: 4 },
    { type: "cross-punch", frames: 6 },
    { type: "taking-punch", frames: 6 },
    { type: "falling-back-death", frames: 7 },
  ],
  pj: [
    { type: "walk", frames: 6 },
    { type: "breathing-idle", frames: 4 },
    { type: "cross-punch", frames: 6 },
    { type: "taking-punch", frames: 6 },
    { type: "falling-back-death", frames: 7 },
  ],
  jason: [
    { type: "walk", frames: 6 },
    { type: "breathing-idle", frames: 4 },
    { type: "cross-punch", frames: 6 },
    { type: "taking-punch", frames: 6 },
    { type: "falling-back-death", frames: 7 },
  ],
  pussy: [
    { type: "walk", frames: 8 },
    { type: "bite", frames: 4 },
  ],
};

// Animation key format: {charId}-{animType}-{direction}
// e.g. "rick-walk-south", "dan-breathing-idle-north-east"
export function getAnimKey(
  charId: string,
  animType: string,
  dir: Direction
): string {
  return `${charId}-${animType}-${dir}`;
}

// Frame image key format: {charId}-{animType}-{direction}-{frameIndex}
export function getFrameKey(
  charId: string,
  animType: string,
  dir: Direction,
  frame: number
): string {
  return `${charId}-${animType}-${dir}-${frame}`;
}

export function hasAnimation(charId: string, animType: string): boolean {
  return (
    CHARACTER_ANIMATIONS[charId]?.some((a) => a.type === animType) ?? false
  );
}

export function getFrameCount(charId: string, animType: string): number {
  return (
    CHARACTER_ANIMATIONS[charId]?.find((a) => a.type === animType)?.frames ?? 0
  );
}
