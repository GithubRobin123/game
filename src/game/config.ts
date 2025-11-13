export const GAME_CONFIG = {
  canvas: {
    width: 1200,
    height: 700
  },
  world: {
    width: 3200,
    height: 2200
  },
  character: { radius: 26, walkSpeed: 3.1, runSpeed: 5.6, health: 100 },
  bullet: { speed: 22, size: 4, maxDistance: 1200 },
  enemy: { speed: 2.3, detectionRange: 520, health: 100 },
} as const;

export const GUN_SVGS: Record<string, string> = {
  AKM: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='60'><rect x='5' y='25' width='110' height='10' fill='#1f1f1f'/></svg>`,
  M416: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='170' height='60'><rect x='8' y='25' width='120' height='10' fill='#191919'/></svg>`,
  AWM: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='190' height='60'><rect x='10' y='27' width='140' height='6' fill='#0e0e0e'/></svg>`,
  UZI: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='60'><rect x='10' y='26' width='70' height='8' fill='#151515'/></svg>`,
  Kar98k: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='190' height='60'><rect x='10' y='29' width='130' height='4' fill='#0c0c0c'/></svg>`,
  "SCAR-L": `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='170' height='60'><rect x='8' y='26' width='120' height='8' fill='#1a1a1a'/></svg>`,
};

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const dist = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1);
export const now = () => performance.now();
