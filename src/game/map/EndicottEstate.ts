import Phaser from "phaser";

// Map is ~3200x3200px (roughly 3.3 screen widths at 960px viewport)
export const MAP_WIDTH = 3200;
export const MAP_HEIGHT = 3200;

// ─── Colors ───
const PATH_COLOR = 0x2a2520;
const PATH_EDGE = 0x332e28;
const MANSION_WALL = 0x3a3550;
const MANSION_ROOF = 0x2a2540;
const MANSION_TRIM = 0x4a4565;
const GAZEBO_COLOR = 0x4a4040;
const GAZEBO_ROOF = 0x3a3535;
const TREE_TRUNK = 0x2a2018;
const TREE_CANOPY = 0x1a3018;
const TREE_CANOPY_LIGHT = 0x203a1e;
const STREETLIGHT_POLE = 0x555555;
const STREETLIGHT_GLOW = 0xffdd88;
const GATE_PILLAR = 0x4a4a4a;
const PARKING_LINE = 0x444444;
const LIBRARY_WALL = 0x251a1a;
const LIBRARY_ROOF = 0x1a1212;
const LIBRARY_TRIM = 0x352828;
const FENCE_POST = 0x3a2a1a;
const FENCE_RAIL = 0x4a3a28;
const FENCE_HIGHLIGHT = 0x5a4a35;
const GREENHOUSE_FRAME = 0x4a5a4a;
const GREENHOUSE_GLASS = 0x3a5a5a;
const DECK_PLANK = 0x3a2a18;
const DECK_PLANK_LIGHT = 0x4a3a28;
const HEDGE_COLOR = 0x1a3a1a;
const HEDGE_LIGHT = 0x204a20;
const BRIDGE_STONE = 0x3a3a3a;
const BRIDGE_WALL = 0x4a4a4a;
const CAR_COLORS = [0x8a2020, 0x2040a0, 0x206020, 0x1a1a1a, 0xd0d0d0, 0x704010, 0x3a1a4a, 0xa08010, 0x204060, 0x6a1a1a];

// ─── Center reference ───
const CX = MAP_WIDTH / 2; // 1600
const CY = MAP_HEIGHT / 2; // 1600

// ─── Landmark positions (exported for collision in GameScene) ───

export const MANSION = {
  x: 1191,
  y: 869,
  width: 570,
  height: 690,
};

// Below mansion, south-center
export const GAZEBO = {
  x: 1581,
  y: 1762,
  radius: 195,
};

// Mid-right area — second gazebo
export const GAZEBO2 = {
  x: 2445,
  y: 1325,
  radius: 155,
};

// Right of mansion — wooden deck platform (tall orientation)
export const DECK = {
  x: 1780,
  y: 922,
  width: 365,
  height: 605,
};

// Bottom-left — library
export const LIBRARY = {
  x: 862,
  y: 2549,
  width: 365,
  height: 565,
};

// Bottom-left corner — parking lot
export const PARKING_LOT = {
  x: 80,
  y: 2275,
  width: 760,
  height: 840,
};

// South-center grove cluster
export const HIDING_GROVE = [
  { x: 1326, y: 2438, size: 120, collisionRadius: 60 },
  { x: 1479, y: 2329, size: 120, collisionRadius: 60 },
  { x: 1306, y: 2249, size: 95, collisionRadius: 47 },
  { x: 1473, y: 2444, size: 110, collisionRadius: 55 },
];

// Left side, mid-height
export const GIANT_WILLOW = {
  x: 343,
  y: 1895,
  radius: 200,
};

// SE quadrant — greenhouse (large, right side)
export const GREENHOUSE = {
  x: 2617,
  y: 1813,
  width: 405,
  height: 605,
};

// SE quadrant — garden maze (3 vertical hedge columns)
export const HEDGE_ROWS = [
  { x: 1918, y: 2136, width: 90, height: 700 },
  { x: 2134, y: 2138, width: 90, height: 700 },
  { x: 2341, y: 2135, width: 90, height: 700 },
];

// South road — stone bridge (small, on the south path)
export const STONE_BRIDGE = {
  x: 1500,
  y: 2550,
  width: 200,
  height: 100,
  wallThickness: 20,
};


// NW quadrant — car show: mixed orientations in top-left corner
export const CAR_SHOW: { x: number; y: number; angle: number; color: number; w: number; h: number }[] = [
  // Editor positions — angle derived from orientation (taller=vertical PI/2, wider=horizontal 0)
  { x: 356, y: 127, angle: Math.PI / 2, color: CAR_COLORS[0], w: 85, h: 305 },
  { x: 550, y: 120, angle: Math.PI / 2, color: CAR_COLORS[1], w: 80, h: 300 },
  { x: 90, y: 570, angle: 0, color: CAR_COLORS[2], w: 310, h: 90 },
  { x: 74, y: 770, angle: 0, color: CAR_COLORS[3], w: 305, h: 85 },
  { x: 92, y: 928, angle: 0, color: CAR_COLORS[4], w: 295, h: 75 },
  { x: 158, y: 123, angle: Math.PI / 2, color: CAR_COLORS[5], w: 95, h: 315 },
  { x: 505, y: 711, angle: 0, color: CAR_COLORS[6], w: 285, h: 65 },
  { x: 500, y: 859, angle: 0, color: CAR_COLORS[7], w: 290, h: 70 },
  { x: 506, y: 549, angle: 0, color: CAR_COLORS[8], w: 290, h: 70 },
  { x: 726, y: 109, angle: Math.PI / 2, color: CAR_COLORS[9], w: 80, h: 300 },
];

// Gates (3 gates — no west gate)
export const GATES = [
  { x: 1570, y: 90, label: "North Gate" },
  { x: 1570, y: 3090, label: "South Gate" },
  { x: 3070, y: 1590, label: "East Gate" },
];

// Trees — scattered across the map (from editor)
export const TREES = [
  // South-center (near grove)
  { x: 1316, y: 2337, size: 70 },
  { x: 1468, y: 2231, size: 100 },
  { x: 1409, y: 2175, size: 60 },
  // NE area
  { x: 2026, y: 504, size: 210 },
  { x: 2764, y: 198, size: 260 },
  { x: 3018, y: 551, size: 220 },
  { x: 3022, y: 280, size: 240 },
  { x: 3002, y: 809, size: 250 },
  { x: 3014, y: 1384, size: 230 },
  // NW (between cars and center)
  { x: 1097, y: 657, size: 240 },
  // East side
  { x: 3002, y: 1104, size: 240 },
];

// Streetlights — along all paths + at landmarks
const mansionCenterX = MANSION.x + MANSION.width / 2;
const mansionCenterY = MANSION.y + MANSION.height / 2;
export const STREETLIGHTS = [
  // North path
  { x: mansionCenterX, y: 500 },
  { x: mansionCenterX, y: MANSION.y - 80 },
  // South path (winding, approximate center)
  { x: mansionCenterX, y: MANSION.y + MANSION.height + 300 },
  { x: mansionCenterX - 40, y: 2200 },
  { x: mansionCenterX + 30, y: 2800 },
  // East path
  { x: mansionCenterX + 500, y: mansionCenterY },
  { x: mansionCenterX + 900, y: mansionCenterY },
  // West path
  { x: mansionCenterX - 500, y: mansionCenterY },
  { x: mansionCenterX - 900, y: mansionCenterY },
  // NE — deck/gazebo area
  { x: DECK.x + 100, y: DECK.y - 50 },
  // SE — greenhouse/maze area
  { x: GREENHOUSE.x, y: GREENHOUSE.y - 100 },
  { x: HEDGE_ROWS[1].x, y: HEDGE_ROWS[1].y - 60 },
  // SW — library/parking
  { x: 500, y: 2200 },
  { x: 300, y: 2500 },
];

// ─── FENCE: perimeter boundary (50px inset, gaps at gates) ───
const FENCE_INSET = 50;
const GATE_GAP = 80; // width of opening at each gate

// ═══════════════════════════════════════════════════════════════
// DRAWING FUNCTIONS
// ═══════════════════════════════════════════════════════════════

export function drawMap(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();

  // Ground + paths now rendered by tilemap (see GameScene create())

  // Wooden fence perimeter
  drawFence(g);

  // Landmarks
  drawParkingLot(g);
  drawLibrary(g);
  drawMansion(g);
  drawGazebo(g, GAZEBO.x, GAZEBO.y, GAZEBO.radius);
  drawGazebo(g, GAZEBO2.x, GAZEBO2.y, GAZEBO2.radius);
  drawDeck(g);
  drawGreenhouse(g);
  drawHedgeRows(g);
  drawStoneBridge(g);
  drawCarShow(g);

  // Hiding grove
  for (const tree of HIDING_GROVE) {
    drawTree(g, tree.x, tree.y, tree.size);
  }

  // Giant willow
  drawTree(g, GIANT_WILLOW.x, GIANT_WILLOW.y, GIANT_WILLOW.radius);

  // Scattered willow trees
  for (const tree of TREES) {
    drawTree(g, tree.x, tree.y, tree.size);
  }

  // Gates
  for (const gate of GATES) {
    drawGate(g, gate.x, gate.y);
  }

  // Streetlights
  for (const light of STREETLIGHTS) {
    drawStreetlightBase(g, light.x, light.y);
  }

  return g;
}

// ─── Paths (cross pattern from mansion) ───
function drawPaths(g: Phaser.GameObjects.Graphics) {
  const pathW = 48;
  const mansionCx = MANSION.x + MANSION.width / 2;
  const mansionCy = MANSION.y + MANSION.height / 2;

  g.fillStyle(PATH_COLOR, 1);
  g.lineStyle(1, PATH_EDGE, 0.5);

  // North path — straight from mansion top to north fence
  g.fillRect(mansionCx - pathW / 2, FENCE_INSET, pathW, MANSION.y - FENCE_INSET);

  // East path — straight from mansion right to east fence
  g.fillRect(MANSION.x + MANSION.width, mansionCy - pathW / 2, MAP_WIDTH - FENCE_INSET - MANSION.x - MANSION.width, pathW);

  // West path — straight from mansion left to west fence (no gate, dead end)
  g.fillRect(FENCE_INSET, mansionCy - pathW / 2, MANSION.x - FENCE_INSET, pathW);

  // South path — winding S-curve from mansion bottom to south fence
  const southPathTop = MANSION.y + MANSION.height + 40;
  const southPathBottom = MAP_HEIGHT - FENCE_INSET;
  const segments = 40;
  const segHeight = (southPathBottom - southPathTop) / segments;

  for (let i = 0; i < segments; i++) {
    const t = i / segments;
    const sy = southPathTop + i * segHeight;
    const sway = Math.sin(t * Math.PI * 2.5) * 60;
    g.fillRect(mansionCx + sway - pathW / 2, sy, pathW, segHeight + 2);
  }

  // Circular path around mansion
  g.lineStyle(pathW, PATH_COLOR, 0.6);
  g.strokeRect(
    MANSION.x - 40,
    MANSION.y - 40,
    MANSION.width + 80,
    MANSION.height + 80
  );

  // Path from east road down to gazebo #1
  g.fillStyle(PATH_COLOR, 1);
  g.fillRect(GAZEBO.x - pathW / 2, mansionCy + pathW / 2, pathW, GAZEBO.y - mansionCy - pathW / 2);

  // Path from east road up to deck/gazebo #2 area
  const deckPathX = DECK.x + DECK.width / 2;
  g.fillRect(deckPathX - pathW / 2, DECK.y + DECK.height, pathW, mansionCy - pathW / 2 - DECK.y - DECK.height);
}

// ─── Wooden Fence (perimeter with gate gaps) ───
function drawFence(g: Phaser.GameObjects.Graphics) {
  const fi = FENCE_INSET;
  const mapW = MAP_WIDTH;
  const mapH = MAP_HEIGHT;
  const postSpacing = 40;
  const postW = 6;
  const postH = 14;
  const railH = 3;

  const drawFenceSegment = (x1: number, y1: number, x2: number, y2: number, horizontal: boolean) => {
    if (horizontal) {
      const len = x2 - x1;
      // Rails
      g.fillStyle(FENCE_RAIL, 0.9);
      g.fillRect(x1, y1 - 2, len, railH);
      g.fillRect(x1, y1 + 5, len, railH);
      // Highlight rail
      g.fillStyle(FENCE_HIGHLIGHT, 0.3);
      g.fillRect(x1, y1 - 2, len, 1);
      // Posts
      const posts = Math.floor(len / postSpacing);
      for (let i = 0; i <= posts; i++) {
        const px = x1 + i * postSpacing;
        g.fillStyle(FENCE_POST, 1);
        g.fillRect(px - postW / 2, y1 - postH / 2, postW, postH);
        // Post cap
        g.fillStyle(FENCE_HIGHLIGHT, 0.5);
        g.fillRect(px - postW / 2, y1 - postH / 2, postW, 2);
      }
    } else {
      const len = y2 - y1;
      g.fillStyle(FENCE_RAIL, 0.9);
      g.fillRect(x1 - 2, y1, railH, len);
      g.fillRect(x1 + 5, y1, railH, len);
      g.fillStyle(FENCE_HIGHLIGHT, 0.3);
      g.fillRect(x1 - 2, y1, 1, len);
      const posts = Math.floor(len / postSpacing);
      for (let i = 0; i <= posts; i++) {
        const py = y1 + i * postSpacing;
        g.fillStyle(FENCE_POST, 1);
        g.fillRect(x1 - postH / 2, py - postW / 2, postH, postW);
        g.fillStyle(FENCE_HIGHLIGHT, 0.5);
        g.fillRect(x1 - postH / 2, py - postW / 2, postH, 2);
      }
    }
  };

  // North fence — gap at north gate (x=1570)
  const ngX = GATES[0].x;
  const ngLeft = ngX - GATE_GAP / 2;
  const ngRight = ngX + GATE_GAP / 2;
  drawFenceSegment(fi, fi, ngLeft, fi, true);
  drawFenceSegment(ngRight, fi, mapW - fi, fi, true);

  // South fence — gap at south gate (x=1570)
  const sgX = GATES[1].x;
  const sgLeft = sgX - GATE_GAP / 2;
  const sgRight = sgX + GATE_GAP / 2;
  drawFenceSegment(fi, mapH - fi, sgLeft, mapH - fi, true);
  drawFenceSegment(sgRight, mapH - fi, mapW - fi, mapH - fi, true);

  // West fence — no gate, solid
  drawFenceSegment(fi, fi, fi, mapH - fi, false);

  // East fence — gap at east gate (y=1590)
  const egY = GATES[2].y;
  const egTop = egY - GATE_GAP / 2;
  const egBottom = egY + GATE_GAP / 2;
  drawFenceSegment(mapW - fi, fi, mapW - fi, egTop, false);
  drawFenceSegment(mapW - fi, egBottom, mapW - fi, mapH - fi, false);
}

// ─── Mansion ───
function drawMansion(g: Phaser.GameObjects.Graphics) {
  const { x, y, width, height } = MANSION;

  g.fillStyle(0x000000, 0.3);
  g.fillRect(x + 8, y + 8, width, height);

  g.fillStyle(MANSION_WALL, 1);
  g.fillRect(x, y, width, height);

  g.fillStyle(MANSION_ROOF, 1);
  g.fillRect(x - 10, y - 10, width + 20, 30);

  g.lineStyle(2, MANSION_TRIM, 0.8);
  g.strokeRect(x, y, width, height);

  // Windows (2 rows of 5)
  g.fillStyle(0x2a3a5a, 0.8);
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 5; col++) {
      const wx = x + 40 + col * 70;
      const wy = y + 50 + row * 100;
      g.fillRect(wx, wy, 30, 40);
      g.fillStyle(0x445577, 0.3);
      g.fillRect(wx + 2, wy + 2, 26, 36);
      g.fillStyle(0x2a3a5a, 0.8);
    }
  }

  // Front door
  g.fillStyle(0x4a3520, 1);
  g.fillRect(x + width / 2 - 20, y + height - 4, 40, 4);
}

// ─── Gazebo (reusable for both) ───
function drawGazebo(g: Phaser.GameObjects.Graphics, x: number, y: number, radius: number) {
  // Floor
  g.fillStyle(0x3a3030, 0.7);
  g.fillCircle(x, y, radius);

  // Roof
  g.fillStyle(GAZEBO_ROOF, 0.6);
  g.fillCircle(x, y, radius + 10);

  // Posts (8 around)
  g.fillStyle(GAZEBO_COLOR, 1);
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const px = x + Math.cos(angle) * (radius - 5);
    const py = y + Math.sin(angle) * (radius - 5);
    g.fillRect(px - 3, py - 3, 6, 6);
  }

  // Partial wall segments (4 arcs at cardinal points for cover)
  g.lineStyle(4, GAZEBO_COLOR, 0.8);
  for (let i = 0; i < 4; i++) {
    const startAngle = (i * Math.PI) / 2 - Math.PI / 8;
    const endAngle = startAngle + Math.PI / 4;
    g.beginPath();
    g.arc(x, y, radius - 2, startAngle, endAngle);
    g.strokePath();
  }

  // Center
  g.fillStyle(0x555050, 0.5);
  g.fillCircle(x, y, 8);
}

// ─── Extended Deck ───
function drawDeck(g: Phaser.GameObjects.Graphics) {
  const { x, y, width, height } = DECK;

  // Shadow
  g.fillStyle(0x000000, 0.2);
  g.fillRect(x + 4, y + 4, width, height);

  // Base
  g.fillStyle(DECK_PLANK, 1);
  g.fillRect(x, y, width, height);

  // Plank lines
  g.lineStyle(1, DECK_PLANK_LIGHT, 0.4);
  const plankSpacing = 16;
  for (let i = 0; i < Math.floor(width / plankSpacing); i++) {
    const lx = x + i * plankSpacing;
    g.moveTo(lx, y);
    g.lineTo(lx, y + height);
  }
  g.strokePath();

  // Border railing
  g.lineStyle(3, FENCE_POST, 0.8);
  g.strokeRect(x, y, width, height);

  // Railing posts at corners and midpoints
  g.fillStyle(FENCE_POST, 1);
  const posts = [
    [x, y], [x + width, y], [x, y + height], [x + width, y + height],
    [x + width / 2, y], [x + width / 2, y + height],
  ];
  for (const [px, py] of posts) {
    g.fillRect(px - 4, py - 4, 8, 8);
  }
}

// ─── Greenhouse ───
function drawGreenhouse(g: Phaser.GameObjects.Graphics) {
  const { x, y, width, height } = GREENHOUSE;

  // Shadow
  g.fillStyle(0x000000, 0.2);
  g.fillRect(x + 4, y + 4, width, height);

  // Glass fill (semi-transparent)
  g.fillStyle(GREENHOUSE_GLASS, 0.35);
  g.fillRect(x, y, width, height);

  // Frame
  g.lineStyle(3, GREENHOUSE_FRAME, 0.9);
  g.strokeRect(x, y, width, height);

  // Internal frame lines (glass panels)
  g.lineStyle(1, GREENHOUSE_FRAME, 0.6);
  // Vertical dividers
  for (let i = 1; i < 4; i++) {
    const lx = x + (width / 4) * i;
    g.moveTo(lx, y);
    g.lineTo(lx, y + height);
  }
  // Horizontal center
  g.moveTo(x, y + height / 2);
  g.lineTo(x + width, y + height / 2);
  g.strokePath();

  // Ridge line (roof peak)
  g.lineStyle(2, GREENHOUSE_FRAME, 0.8);
  g.moveTo(x, y + height / 2);
  g.lineTo(x + width, y + height / 2);
  g.strokePath();

  // Green interior (plants visible through glass)
  g.fillStyle(0x1a4a1a, 0.25);
  g.fillRect(x + 8, y + 8, width - 16, height / 2 - 12);
  g.fillStyle(0x2a5a2a, 0.2);
  g.fillRect(x + 8, y + height / 2 + 4, width - 16, height / 2 - 12);

  // Door (south side center)
  g.fillStyle(GREENHOUSE_FRAME, 0.9);
  g.fillRect(x + width / 2 - 12, y + height - 3, 24, 3);
}

// ─── Hedge Rows (Garden Maze) ───
function drawHedgeRows(g: Phaser.GameObjects.Graphics) {
  for (const hedge of HEDGE_ROWS) {
    // Shadow
    g.fillStyle(0x000000, 0.2);
    g.fillRect(hedge.x + 3, hedge.y + 3, hedge.width, hedge.height);

    // Hedge body
    g.fillStyle(HEDGE_COLOR, 0.9);
    g.fillRoundedRect(hedge.x, hedge.y, hedge.width, hedge.height, 6);

    // Top highlight
    g.fillStyle(HEDGE_LIGHT, 0.4);
    g.fillRoundedRect(hedge.x + 2, hedge.y + 2, hedge.width - 4, hedge.height / 3, 4);

    // Leaf texture dots
    g.fillStyle(HEDGE_LIGHT, 0.3);
    for (let i = 0; i < 8; i++) {
      const lx = hedge.x + 10 + Math.random() * (hedge.width - 20);
      const ly = hedge.y + 5 + Math.random() * (hedge.height - 10);
      g.fillCircle(lx, ly, 3);
    }
  }
}

// ─── Stone Bridge ───
function drawStoneBridge(g: Phaser.GameObjects.Graphics) {
  const { x, y, width, height, wallThickness } = STONE_BRIDGE;

  // Shadow
  g.fillStyle(0x000000, 0.2);
  g.fillRect(x + 4, y + 4, width, height);

  // Bridge surface
  g.fillStyle(BRIDGE_STONE, 0.9);
  g.fillRect(x, y, width, height);

  // Stone pattern
  g.lineStyle(1, 0x4a4a4a, 0.3);
  for (let i = 0; i < 3; i++) {
    const ly = y + 15 + i * 15;
    g.moveTo(x + 5, ly);
    g.lineTo(x + width - 5, ly);
  }
  g.strokePath();

  // Side walls
  g.fillStyle(BRIDGE_WALL, 1);
  g.fillRect(x, y, width, wallThickness);
  g.fillRect(x, y + height - wallThickness, width, wallThickness);

  // Wall caps
  g.fillStyle(0x5a5a5a, 0.8);
  g.fillRect(x, y, width, 3);
  g.fillRect(x, y + height - 3, width, 3);
}

// ─── Car Show (classic cars, L-shaped along NW fence) ───
function drawCarShow(g: Phaser.GameObjects.Graphics) {
  for (const car of CAR_SHOW) {
    drawCar(g, car.x, car.y, car.angle, car.color, car.w, car.h);
  }
}

function drawCar(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, color: number, cw: number, ch: number) {
  // cw/ch are the actual draw dimensions from editor

  // Shadow
  g.fillStyle(0x000000, 0.25);
  g.fillRoundedRect(x - cw / 2 + 3, y - ch / 2 + 3, cw, ch, 4);

  // Body
  g.fillStyle(color, 1);
  g.fillRoundedRect(x - cw / 2, y - ch / 2, cw, ch, 4);

  // Roof (center, slightly smaller)
  g.fillStyle(0x000000, 0.15);
  if (angle === 0) {
    g.fillRoundedRect(x - cw * 0.15, y - ch * 0.35, cw * 0.35, ch * 0.7, 3);
  } else {
    g.fillRoundedRect(x - cw * 0.35, y - ch * 0.15, cw * 0.7, ch * 0.35, 3);
  }

  // Windshield
  g.fillStyle(0x4a6a8a, 0.5);
  if (angle === 0) {
    g.fillRect(x + cw * 0.15, y - ch * 0.3, 4, ch * 0.6);
    g.fillRect(x - cw * 0.2, y - ch * 0.3, 4, ch * 0.6);
  } else {
    g.fillRect(x - cw * 0.3, y + ch * 0.15, cw * 0.6, 4);
    g.fillRect(x - cw * 0.3, y - ch * 0.2, cw * 0.6, 4);
  }

  // Headlights
  g.fillStyle(0xffffcc, 0.6);
  if (angle === 0) {
    g.fillCircle(x + cw / 2 - 4, y - ch / 4, 3);
    g.fillCircle(x + cw / 2 - 4, y + ch / 4, 3);
  } else {
    g.fillCircle(x - cw / 4, y + ch / 2 - 4, 3);
    g.fillCircle(x + cw / 4, y + ch / 2 - 4, 3);
  }

  // Taillights
  g.fillStyle(0xcc2222, 0.6);
  if (angle === 0) {
    g.fillCircle(x - cw / 2 + 4, y - ch / 4, 2);
    g.fillCircle(x - cw / 2 + 4, y + ch / 4, 2);
  } else {
    g.fillCircle(x - cw / 4, y - ch / 2 + 4, 2);
    g.fillCircle(x + cw / 4, y - ch / 2 + 4, 2);
  }

  // Chrome trim line
  g.lineStyle(1, 0xaaaaaa, 0.3);
  if (angle === 0) {
    g.moveTo(x - cw / 2 + 6, y);
    g.lineTo(x + cw / 2 - 6, y);
  } else {
    g.moveTo(x, y - ch / 2 + 6);
    g.lineTo(x, y + ch / 2 - 6);
  }
  g.strokePath();
}

// ─── Parking Lot ───
function drawParkingLot(g: Phaser.GameObjects.Graphics) {
  const { x: px, y: py, width: pw, height: ph } = PARKING_LOT;

  g.fillStyle(0x1a1a1a, 1);
  g.fillRect(px, py, pw, ph);

  g.lineStyle(1, PARKING_LINE, 0.5);
  const lineCount = Math.floor(pw / 50);
  for (let i = 0; i < lineCount; i++) {
    const lx = px + 30 + i * 50;
    g.moveTo(lx, py + 20);
    g.lineTo(lx, py + ph - 20);
  }
  g.strokePath();

  g.lineStyle(2, 0x333333, 0.6);
  g.strokeRect(px, py, pw, ph);
}

// ─── Library ───
function drawLibrary(g: Phaser.GameObjects.Graphics) {
  const { x, y, width, height } = LIBRARY;

  g.fillStyle(0x000000, 0.3);
  g.fillRect(x + 6, y + 6, width, height);

  g.fillStyle(LIBRARY_WALL, 1);
  g.fillRect(x, y, width, height);

  g.fillStyle(LIBRARY_ROOF, 1);
  g.fillRect(x - 6, y - 8, width + 12, 20);

  g.lineStyle(2, LIBRARY_TRIM, 0.8);
  g.strokeRect(x, y, width, height);

  g.fillStyle(0x2a2a3a, 0.8);
  for (let col = 0; col < 3; col++) {
    const wx = x + 30 + col * 60;
    const wy = y + 35;
    g.fillRect(wx, wy, 25, 35);
    g.fillStyle(0x3a3a4a, 0.3);
    g.fillRect(wx + 2, wy + 2, 21, 31);
    g.fillStyle(0x2a2a3a, 0.8);
  }

  g.fillStyle(0x3a2518, 1);
  g.fillRect(x + width / 2 - 15, y + height - 4, 30, 4);
}

// ─── Tree ───
function drawTree(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number) {
  g.fillStyle(0x000000, 0.2);
  g.fillEllipse(x + 5, y + size * 0.3, size * 1.2, size * 0.6);

  g.fillStyle(TREE_TRUNK, 1);
  g.fillRect(x - 6, y - 4, 12, 20);

  g.fillStyle(TREE_CANOPY, 0.7);
  g.fillCircle(x, y - size * 0.3, size * 0.5);
  g.fillCircle(x - size * 0.25, y - size * 0.1, size * 0.4);
  g.fillCircle(x + size * 0.25, y - size * 0.15, size * 0.4);

  g.fillStyle(TREE_CANOPY_LIGHT, 0.4);
  g.fillCircle(x + size * 0.1, y - size * 0.35, size * 0.25);
}

// ─── Streetlight base ───
function drawStreetlightBase(g: Phaser.GameObjects.Graphics, x: number, y: number) {
  g.fillStyle(STREETLIGHT_POLE, 1);
  g.fillRect(x - 2, y - 20, 4, 20);
  g.fillStyle(0x666666, 1);
  g.fillRect(x - 6, y - 24, 12, 6);
}

// ─── Gate ───
function drawGate(g: Phaser.GameObjects.Graphics, x: number, y: number) {
  g.fillStyle(GATE_PILLAR, 1);
  g.fillRect(x - 30, y - 10, 16, 20);
  g.fillRect(x + 14, y - 10, 16, 20);

  g.fillStyle(0x3a3a3a, 0.8);
  g.fillRect(x - 14, y - 6, 28, 4);
  g.fillRect(x - 14, y + 2, 28, 4);

  g.fillStyle(0x5a5a5a, 1);
  g.fillRect(x - 32, y - 14, 20, 6);
  g.fillRect(x + 12, y - 14, 20, 6);
}

// ─── Hiding grove canopy (above player) ───
export function drawHidingGroveCanopy(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  g.setDepth(25);

  for (const tree of HIDING_GROVE) {
    const { x, y, size } = tree;
    g.fillStyle(TREE_CANOPY, 0.85);
    g.fillCircle(x, y - size * 0.3, size * 0.5);
    g.fillCircle(x - size * 0.25, y - size * 0.1, size * 0.4);
    g.fillCircle(x + size * 0.25, y - size * 0.15, size * 0.4);
    g.fillStyle(TREE_CANOPY_LIGHT, 0.35);
    g.fillCircle(x + size * 0.1, y - size * 0.35, size * 0.25);
  }

  return g;
}

// ─── Lighting (darkness + streetlight holes) ───
export function drawLighting(scene: Phaser.Scene): Phaser.GameObjects.RenderTexture {
  const rt = scene.add.renderTexture(0, 0, MAP_WIDTH, MAP_HEIGHT);
  rt.setOrigin(0, 0);
  rt.setDepth(50);

  const darkness = scene.add.graphics();
  darkness.fillStyle(0x0a0a1a, 1);
  darkness.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
  rt.draw(darkness);
  darkness.destroy();

  const lights = scene.add.graphics();

  for (const light of STREETLIGHTS) {
    lights.fillStyle(0xffffff, 0.3);
    lights.fillCircle(light.x, light.y, 180);
    lights.fillStyle(0xffffff, 0.4);
    lights.fillCircle(light.x, light.y, 100);
    lights.fillStyle(0xffffff, 0.2);
    lights.fillCircle(light.x, light.y, 50);
  }

  // Mansion window glow
  lights.fillStyle(0xffffff, 0.25);
  lights.fillRect(MANSION.x - 40, MANSION.y - 40, MANSION.width + 80, MANSION.height + 80);
  lights.fillStyle(0xffffff, 0.15);
  lights.fillRect(MANSION.x - 80, MANSION.y - 80, MANSION.width + 160, MANSION.height + 160);

  // Greenhouse glow (interior lights)
  lights.fillStyle(0xffffff, 0.2);
  lights.fillRect(GREENHOUSE.x - 20, GREENHOUSE.y - 20, GREENHOUSE.width + 40, GREENHOUSE.height + 40);

  // Gazebo #2 ambient
  lights.fillStyle(0xffffff, 0.15);
  lights.fillCircle(GAZEBO2.x, GAZEBO2.y, 120);

  // Deck string lights
  lights.fillStyle(0xffffff, 0.15);
  lights.fillRect(DECK.x - 20, DECK.y - 20, DECK.width + 40, DECK.height + 40);

  rt.erase(lights);
  lights.destroy();

  rt.setAlpha(0.5);

  // Warm glow halos
  const glows = scene.add.graphics();
  glows.setDepth(51);
  for (const light of STREETLIGHTS) {
    glows.fillStyle(STREETLIGHT_GLOW, 0.04);
    glows.fillCircle(light.x, light.y, 120);
    glows.fillStyle(STREETLIGHT_GLOW, 0.06);
    glows.fillCircle(light.x, light.y, 60);
  }

  return rt;
}
