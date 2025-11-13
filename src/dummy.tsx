// ✅ PUBG-Style TDM Game — PRO EDITION (Single file, readable)
// - Real gun sounds (HTMLAudio)
// - Walking animation (leg swing)
// - Gun pivot in hand
// - Space: climb onto containers; Space again: drop down
// - Weapon inventory bar (click to switch)
// - 3D-looking containers
// - Safe image draws (no "broken" drawImage error)
// ---------------------------------------------------------

import React, { useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import akm from "./sounds/akm.mp3";
import m416 from "./sounds/m416.mp3";
import awm from "./sounds/awm.mp3"
import uzi from "./sounds/awm.mp3";

// ---------------------------- CONFIG ----------------------------
const GAME_CONFIG = {
  canvas: { width: 1200, height: 700 },
  world: { width: 3200, height: 2200 },
  character: { radius: 26, walkSpeed: 3.1, runSpeed: 5.6, health: 100 },
  bullet: { speed: 22, size: 4, maxDistance: 1200 },
  enemy: { speed: 2.3, detectionRange: 520, health: 100 },
};

// ------------------------ GUN IMAGES (inline) ------------------------
const GUN_SVGS: Record<string, string> = {
  AKM: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='60'><rect x='5' y='25' width='110' height='10' fill='#1f1f1f'/></svg>`,
  M416: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='170' height='60'><rect x='8' y='25' width='120' height='10' fill='#191919'/></svg>`,
  AWM: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='190' height='60'><rect x='10' y='27' width='140' height='6' fill='#0e0e0e'/></svg>`,
  UZI: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='60'><rect x='10' y='26' width='70' height='8' fill='#151515'/></svg>`,
  Kar98k: `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='190' height='60'><rect x='10' y='29' width='130' height='4' fill='#0c0c0c'/></svg>`,
  "SCAR-L": `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='170' height='60'><rect x='8' y='26' width='120' height='8' fill='#1a1a1a'/></svg>`,
};

// ------------------------ GUN SOUNDS (public/) ------------------------
const GUN_SOUNDS = {
  AKM: akm,
  M416: m416,
  UZI: uzi,
  AWM: awm,
};

// ----------------------------- WEAPONS -----------------------------
type Weapon = {
  id: number;
  name: string;
  damage: number;
  fireRate: number;
  ammo: number;
  maxAmmo: number;
  reloadTime: number;
};

const WEAPONS: Weapon[] = [
  { id: 1, name: "AKM", damage: 35, fireRate: 120, ammo: 30, maxAmmo: 30, reloadTime: 1800 },
  { id: 2, name: "M416", damage: 28, fireRate: 100, ammo: 40, maxAmmo: 40, reloadTime: 2000 },
  { id: 3, name: "AWM", damage: 95, fireRate: 1100, ammo: 5, maxAmmo: 5, reloadTime: 2800 },
  { id: 4, name: "UZI", damage: 22, fireRate: 60, ammo: 35, maxAmmo: 35, reloadTime: 1400 },
  { id: 5, name: "Kar98k", damage: 85, fireRate: 1000, ammo: 5, maxAmmo: 5, reloadTime: 2600 },
  { id: 6, name: "SCAR-L", damage: 30, fireRate: 110, ammo: 30, maxAmmo: 30, reloadTime: 1900 },
];

// ----------------------------- HELPERS -----------------------------
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (x1: number, y1: number, x2: number, y2: number) => Math.hypot(x2 - x1, y2 - y1);
const now = () => performance.now();

// Safe extended image flags to avoid "broken" state draw
interface ExtendedImage extends HTMLImageElement {
  _loaded?: boolean;
  _broken?: boolean;
  _handlersSet?: boolean;
}

// ----------------------------- COMPONENT -----------------------------
export default function PubgTDMGame() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const stateRef = useRef<any>(null);

  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [ui, setUi] = useState({ kills: 0, health: 100, ammo: 30, weapon: "AKM" });

  const gunImgRef = useRef<Record<string, ExtendedImage>>({});
  const audioCacheRef = useRef<Record<string, HTMLAudioElement>>({});

  let walkCycle = useRef(0);

  // Preload gun images safely
  useEffect(() => {
    const cache: Record<string, ExtendedImage> = {};
    Object.keys(GUN_SVGS).forEach((k) => {
      const img = new Image() as ExtendedImage;
      img._loaded = false;
      img._broken = false;
      img._handlersSet = true;
      img.onload = () => {
        img._loaded = true;
        img._broken = false;
      };
      img.onerror = () => {
        img._broken = true;
      };
      img.src = GUN_SVGS[k];
      cache[k] = img;
    });
    gunImgRef.current = cache;
  }, []);

  // Preload audio once
  useEffect(() => {
    const cache: Record<string, HTMLAudioElement> = {};
    Object.entries(GUN_SOUNDS).forEach(([name, url]) => {
      const a = new Audio(url);
      a.preload = "auto";
      cache[name] = a;
    });
    audioCacheRef.current = cache;
  }, []);

  useEffect(() => {
    if (!running) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;

    // ------------- STATE -------------
    const state = {
      player: {
        x: 1600,
        y: 1100,
        rot: 0,
        health: GAME_CONFIG.character.health,
        maxHealth: GAME_CONFIG.character.health,
        weapon: { ...WEAPONS[0] },
        isReloading: false,
        reloadStart: 0,
        lastShot: 0,
        kills: 0,
        isOnContainer: false,
      },
      bullets: [] as any[],
      enemies: [] as any[],
      pickups: { weapons: [] as any[], ammo: [] as any[] },
      containers: [] as any[],
      camera: { x: 0, y: 0 },
      mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false },
      keys: {} as Record<string, boolean>,
    };
    stateRef.current = state;

    // ------------- SOUNDS -------------
    const playGun = (w: Weapon) => {
      if (muted) return;
      const key = w.name in audioCacheRef.current ? w.name : "AKM";
      const a = audioCacheRef.current[key]?.cloneNode(true) as HTMLAudioElement;
      if (!a) return;
      a.volume = 0.35;
      // `play()` can reject if not allowed; ignore
      a.play().catch(() => {});
    };

    // ------------- WORLD SETUP -------------
    const tables = [
      { x: 520, y: 420 },
      { x: 2300, y: 420 },
      { x: 1250, y: 1500 },
      { x: 1850, y: 850 },
    ];
    // Place two weapons per table
    tables.forEach((t) =>
      WEAPONS.slice(0, 2).forEach((g, i) =>
        state.pickups.weapons.push({
          x: t.x + i * 90,
          y: t.y,
          weapon: { ...g, ammo: g.maxAmmo },
        })
      )
    );
    // Ammo spots
    const ammoXs = [640, 2100, 1520, 820, 2280, 420];
    const ammoYs = [640, 620, 1250, 1580, 1240, 1020];
    ammoXs.forEach((x, i) => state.pickups.ammo.push({ x, y: ammoYs[i], amount: 30 }));

    // Containers (3D-ish boxes are drawn later)
    state.containers = [
      { x: 300, y: 300, w: 180, h: 180 },
      { x: 2600, y: 380, w: 180, h: 180 },
      { x: 1400, y: 600, w: 240, h: 120 },
      { x: 700, y: 1320, w: 200, h: 200 },
      { x: 2350, y: 1600, w: 180, h: 180 },
      { x: 1050, y: 820, w: 120, h: 220 },
      { x: 1700, y: 1000, w: 300, h: 140 },
      { x: 1900, y: 1500, w: 160, h: 240 },
    ];

    // Enemies
    const spots = [
      [420, 520],
      [2500, 520],
      [1520, 1680],
      [820, 1420],
      [2250, 1360],
      [2800, 900],
      [500, 1800],
    ];
    for (let i = 0; i < 7; i++) {
      const s = spots[i % spots.length];
      state.enemies.push({
        x: s[0],
        y: s[1],
        rot: 0,
        health: GAME_CONFIG.enemy.health,
        maxHealth: GAME_CONFIG.enemy.health,
        lastShot: 0,
        state: "patrol",
        weapon: { ...WEAPONS[i % 4] },
      });
    }

    // ------------- INPUT -------------
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const key = e.key.toLowerCase();
      state.keys[key] = down;

      if (down && e.key === " ") {
        e.preventDefault();
        jump();
      }
      if (down && key === "r") {
        reload(state.player);
      }
      if (down && /^[1-6]$/.test(e.key)) {
        const w = WEAPONS[Number(e.key) - 1];
        if (w) equip(state.player, w);
      }
    };

    const jump = () => {
      const p = state.player;
      // If overlapping container, snap onto top
      for (const c of state.containers) {
        if (p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h + 15) {
          p.y = c.y - 10;
          p.isOnContainer = true;
          return;
        }
      }
      // If on container, drop down
      if (p.isOnContainer) {
        p.y += 50;
        p.isOnContainer = false;
      }
    };

    // ------------- COMBAT / STATE HELPERS -------------
    const reload = (a: any) => {
      if (a.isReloading || a.weapon.ammo >= a.weapon.maxAmmo) return;
      a.isReloading = true;
      a.reloadStart = now();
    };

    const finishReload = (a: any) => {
      if (!a.isReloading) return;
      if (now() - a.reloadStart >= a.weapon.reloadTime) {
        a.weapon.ammo = a.weapon.maxAmmo;
        a.isReloading = false;
      }
    };

    const equip = (a: any, w: Weapon) => {
      a.weapon = { ...w, ammo: w.maxAmmo };
    };

    const shoot = (a: any) => {
      const t = now();
      if (a.isReloading || t - a.lastShot < a.weapon.fireRate || a.weapon.ammo <= 0) return;
      a.lastShot = t;
      a.weapon.ammo--;
      playGun(a.weapon);
      const c = Math.cos(a.rot),
        s = Math.sin(a.rot);
      state.bullets.push({
        x: a.x + c * 38,
        y: a.y + s * 38,
        vx: c * GAME_CONFIG.bullet.speed,
        vy: s * GAME_CONFIG.bullet.speed,
        life: 0,
        owner: a,
      });
    };

    const moveAndCollide = (x: number, y: number, vx: number, vy: number) => {
      let nx = x + vx,
        ny = y + vy;
      nx = clamp(nx, 58, GAME_CONFIG.world.width - 58);
      ny = clamp(ny, 58, GAME_CONFIG.world.height - 58);
      for (const c of state.containers) {
        if (nx > c.x - 8 && nx < c.x + c.w + 8 && ny > c.y - 8 && ny < c.y + c.h + 8) {
          const dL = Math.abs(nx - (c.x - 8));
          const dR = Math.abs(nx - (c.x + c.w + 8));
          const dT = Math.abs(ny - (c.y - 8));
          const dB = Math.abs(ny - (c.y + c.h + 8));
          const m = Math.min(dL, dR, dT, dB);
          if (m === dL) nx = c.x - 8;
          else if (m === dR) nx = c.x + c.w + 8;
          else if (m === dT) ny = c.y - 8;
          else ny = c.y + c.h + 8;
        }
      }
      return { x: nx, y: ny };
    };

    const damage = (a: any, d: number) => {
      a.health -= d;
      if (a.health <= 0) death(a);
    };

    const death = (a: any) => {
      if (a === state.player) {
        // respawn
        state.player.x = 600;
        state.player.y = 1200;
        state.player.health = state.player.maxHealth;
        equip(state.player, WEAPONS[0]);
      } else {
        state.player.kills++;
        a.x = 2800;
        a.y = 900;
        a.health = a.maxHealth;
      }
    };

    // ------------- MOUSE -------------
    const rectOf = () => canvas.getBoundingClientRect();
    const onMouseMove = (e: MouseEvent) => {
      const r = rectOf();
      state.mouse.x = e.clientX - r.left;
      state.mouse.y = e.clientY - r.top;
    };
    const onMouseDown = () => (state.mouse.down = true);
    const onMouseUp = () => (state.mouse.down = false);

    // ------------- LOOP -------------
    let last = performance.now();

    const drawWarehouseBackground = () => {
      // floor grid
      ctx.fillStyle = "#3f4246";
      ctx.fillRect(0, 0, GAME_CONFIG.world.width, GAME_CONFIG.world.height);
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 2;
      const tile = 120;
      for (let x = 0; x < GAME_CONFIG.world.width; x += tile) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, GAME_CONFIG.world.height);
        ctx.stroke();
      }
      for (let y = 0; y < GAME_CONFIG.world.height; y += tile) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(GAME_CONFIG.world.width, y);
        ctx.stroke();
      }
      // walls
      ctx.fillStyle = "#2b2e31";
      ctx.fillRect(0, 0, GAME_CONFIG.world.width, 50);
      ctx.fillRect(0, GAME_CONFIG.world.height - 50, GAME_CONFIG.world.width, 50);
      ctx.fillRect(0, 0, 50, GAME_CONFIG.world.height);
      ctx.fillRect(GAME_CONFIG.world.width - 50, 0, 50, GAME_CONFIG.world.height);
    };

    const draw3DContainers = () => {
      state.containers.forEach((c: any) => {
        // front
        ctx.fillStyle = "#34516A";
        ctx.fillRect(c.x, c.y, c.w, c.h);
        // top
        ctx.fillStyle = "#496D89";
        ctx.beginPath();
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + 12, c.y - 12);
        ctx.lineTo(c.x + c.w + 12, c.y - 12);
        ctx.lineTo(c.x + c.w, c.y);
        ctx.closePath();
        ctx.fill();
        // side
        ctx.fillStyle = "#293B4C";
        ctx.beginPath();
        ctx.moveTo(c.x + c.w, c.y);
        ctx.lineTo(c.x + c.w + 12, c.y - 12);
        ctx.lineTo(c.x + c.w + 12, c.y + c.h - 12);
        ctx.lineTo(c.x + c.w, c.y + c.h);
        ctx.closePath();
        ctx.fill();
        // ribs
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 3;
        for (let x = c.x + 10; x < c.x + c.w; x += 22) {
          ctx.beginPath();
          ctx.moveTo(x, c.y);
          ctx.lineTo(x, c.y + c.h);
          ctx.stroke();
        }
      });
    };

    const drawWeaponPickup = (px: number, py: number, weaponName: string) => {
      // glow
      const g = ctx.createRadialGradient(px, py, 6, px, py, 40);
      g.addColorStop(0, "rgba(255,215,0,0.6)");
      g.addColorStop(1, "rgba(255,215,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(px - 40, py - 40, 80, 80);

      // image (safe)
      const img = gunImgRef.current[weaponName];
      if (img && img._loaded && !img._broken && img.naturalWidth > 0) {
        try {
          ctx.drawImage(img, px - 40, py - 12, 80, 24);
        } catch {
          // fallback
          ctx.fillStyle = "#ddc241";
          ctx.fillRect(px - 40, py - 10, 80, 20);
        }
      } else {
        ctx.fillStyle = "#ddc241";
        ctx.fillRect(px - 40, py - 10, 80, 20);
      }

      // label
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.textAlign = "center";
      ctx.font = "bold 12px Arial";
      ctx.strokeText(weaponName, px, py + 32);
      ctx.fillText(weaponName, px, py + 32);
    };

    const drawAmmoBox = (ax: number, ay: number) => {
      const gr = ctx.createRadialGradient(ax, ay, 6, ax, ay, 34);
      gr.addColorStop(0, "rgba(46,204,113,0.6)");
      gr.addColorStop(1, "rgba(46,204,113,0)");
      ctx.fillStyle = gr;
      ctx.fillRect(ax - 34, ay - 34, 68, 68);

      ctx.fillStyle = "#27ae60";
      ctx.fillRect(ax - 20, ay - 14, 40, 28);
      ctx.strokeStyle = "#1f8a4b";
      ctx.lineWidth = 3;
      ctx.strokeRect(ax - 20, ay - 14, 40, 28);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px Arial";
      ctx.textAlign = "center";
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.strokeText("AMMO", ax, ay + 30);
      ctx.fillText("AMMO", ax, ay + 30);
    };

    const drawCharacter = (
      x: number,
      y: number,
      rot: number,
      isPlayer: boolean,
      healthPct?: number
    ) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);

      // shadow
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.ellipse(0, 30, 26, 10, 0, 0, Math.PI * 2);
      ctx.fill();

      // legs (walk animation)
      const legOffset = Math.sin(walkCycle.current) * 6;
      ctx.fillStyle = "#2b2b30";
      ctx.fillRect(-16, 6 + legOffset, 14, 26);
      ctx.fillRect(2, 6 - legOffset, 14, 26);

      // torso
      ctx.fillStyle = isPlayer ? "#2c3e50" : "#6d4c41";
      ctx.fillRect(-20, -14, 40, 40);

      // arm lines
      ctx.strokeStyle = "#d6a475";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-18, -4);
      ctx.lineTo(-34, 8);
      ctx.moveTo(18, -4);
      ctx.lineTo(34, 8);
      ctx.stroke();

      // weapon in hand (only show for player so it pivots)
      if (isPlayer) {
        const img = gunImgRef.current[state.player.weapon.name];
        if (img && img._loaded && !img._broken && img.naturalWidth > 0) {
          try {
            ctx.save();
            ctx.translate(18, -2);
            ctx.drawImage(img, -10, -8, 70, 20);
            ctx.restore();
          } catch {
            // ignore if draw fails
          }
        } else {
          // simple rectangle as fallback
          ctx.fillStyle = "#111";
          ctx.fillRect(6, -6, 36, 8);
        }
      }

      // head
      ctx.fillStyle = "#e6c29b";
      ctx.beginPath();
      ctx.arc(0, -28, 14, 0, Math.PI * 2);
      ctx.fill();

      // small helmet for player
      if (isPlayer) {
        ctx.fillStyle = "#28343f";
        ctx.beginPath();
        ctx.arc(0, -32, 15, Math.PI, 0);
        ctx.fill();
      }

      ctx.restore();

      // health bar
      if (typeof healthPct === "number") {
        ctx.fillStyle = "black";
        ctx.fillRect(x - 32, y - 48, 64, 7);
        ctx.fillStyle = healthPct > 0.5 ? "#2ecc71" : "#e74c3c";
        ctx.fillRect(x - 32, y - 48, 64 * healthPct, 7);
      }
    };

    const tick = () => {
      const t = performance.now();
      const dt = Math.min((t - last) / 16.67, 2);
      last = t;

      const p = state.player;
      const k = state.keys;
      const speed = k.shift ? GAME_CONFIG.character.runSpeed : GAME_CONFIG.character.walkSpeed;

      // movement
      let vx = (k.a ? -speed : 0) + (k.d ? speed : 0);
      let vy = (k.w ? -speed : 0) + (k.s ? speed : 0);
      if (vx && vy) {
        vx *= 0.7071;
        vy *= 0.7071;
      }
      const pos = moveAndCollide(p.x, p.y, vx, vy);
      if (vx || vy) walkCycle.current += 0.18;
      p.x = pos.x;
      p.y = pos.y;

      // aim & shoot
      p.rot = Math.atan2(state.mouse.wy - p.y, state.mouse.wx - p.x);
      if (state.mouse.down) shoot(p);
      finishReload(p);

      // enemies AI
      // state.enemies.forEach((e) => {
      //   finishReload(e);
      //   const d = dist(e.x, e.y, p.x, p.y);
      //   if (d < GAME_CONFIG.enemy.detectionRange) {
      //     e.rot = Math.atan2(p.y - e.y, p.x - e.x);
      //     const sp = d > 140 ? GAME_CONFIG.enemy.speed : 0;
      //     const ep = moveAndCollide(e.x, e.y, Math.cos(e.rot) * sp, Math.sin(e.rot) * sp);
      //     e.x = ep.x;
      //     e.y = ep.y;
      //     if (d < 500 && now() - e.lastShot > e.weapon.fireRate) {
      //       e.lastShot = now();
      //       state.bullets.push({
      //         x: e.x,
      //         y: e.y,
      //         vx: Math.cos(e.rot) * (GAME_CONFIG.bullet.speed - 2),
      //         vy: Math.sin(e.rot) * (GAME_CONFIG.bullet.speed - 2),
      //         life: 0,
      //         owner: e,
      //       });
      //     }
      //   }
      // });

      // bullets
      for (let i = state.bullets.length - 1; i >= 0; i--) {
        const b = state.bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.life += Math.hypot(b.vx, b.vy);
        if (
          b.x < 58 ||
          b.x > GAME_CONFIG.world.width - 58 ||
          b.y < 58 ||
          b.y > GAME_CONFIG.world.height - 58
        ) {
          state.bullets.splice(i, 1);
          continue;
        }
        // hit player
        if (b.owner !== p && dist(b.x, b.y, p.x, p.y) < GAME_CONFIG.character.radius) {
          damage(p, b.owner.weapon.damage);
          state.bullets.splice(i, 1);
          continue;
        }
        // hit enemies
        if (b.owner === p) {
          for (const e of state.enemies) {
            if (dist(b.x, b.y, e.x, e.y) < GAME_CONFIG.character.radius) {
              damage(e, p.weapon.damage);
              state.bullets.splice(i, 1);
              break;
            }
          }
        }
        if (b.life > GAME_CONFIG.bullet.maxDistance) {
          state.bullets.splice(i, 1);
        }
      }

      // camera
      state.camera.x = clamp(
        p.x - GAME_CONFIG.canvas.width / 2 + (state.mouse.x - GAME_CONFIG.canvas.width / 2) * 0.2,
        0,
        GAME_CONFIG.world.width - GAME_CONFIG.canvas.width
      );
      state.camera.y = clamp(
        p.y - GAME_CONFIG.canvas.height / 2 + (state.mouse.y - GAME_CONFIG.canvas.height / 2) * 0.2,
        0,
        GAME_CONFIG.world.height - GAME_CONFIG.canvas.height
      );
      state.mouse.wx = state.mouse.x + state.camera.x;
      state.mouse.wy = state.mouse.y + state.camera.y;

      // ---- RENDER ----
      ctx.save();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(-state.camera.x, -state.camera.y);

      drawWarehouseBackground();
      draw3DContainers();

      // pickups
      state.pickups.weapons.forEach((w: any) => drawWeaponPickup(w.x, w.y, w.weapon.name));
      state.pickups.ammo.forEach((a: any) => drawAmmoBox(a.x, a.y));

      // bullets
      ctx.fillStyle = "#ffd54f";
      state.bullets.forEach((b: any) => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, GAME_CONFIG.bullet.size, 0, Math.PI * 2);
        ctx.fill();
      });

      // enemies
      state.enemies.forEach((e: any) =>
        drawCharacter(e.x, e.y, e.rot, false, e.health / e.maxHealth)
      );

      // player
      drawCharacter(p.x, p.y, p.rot, true, p.health / p.maxHealth);

      ctx.restore();

      // HUD state
      setUi({
        kills: p.kills,
        health: Math.max(0, Math.round(p.health)),
        ammo: p.weapon.ammo,
        weapon: p.weapon.name,
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    // attach listeners
    const onKeyDown = (e: KeyboardEvent) => onKey(e, true);
    const onKeyUp = (e: KeyboardEvent) => onKey(e, false);

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mousedown", onMouseDown);
    canvas.addEventListener("mouseup", onMouseUp);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    rafRef.current = requestAnimationFrame(tick);

    // cleanup
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mousedown", onMouseDown);
      canvas.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [running, muted]);

  // --------------------------- UI ---------------------------
  return (
    <div style={{ width: "100%", display: "flex", justifyContent: "center", padding: 16 }}>
      <div style={{ position: "relative" }}>
        <canvas
          ref={canvasRef}
          width={GAME_CONFIG.canvas.width}
          height={GAME_CONFIG.canvas.height}
          style={{
            borderRadius: 12,
            background: "#1f2225",
            boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            border: "1px solid #31343a",
          }}
        />

        {/* HUD */}
        <div
          style={{
            position: "absolute",
            left: 12,
            top: 12,
            display: "flex",
            gap: 12,
            alignItems: "center",
          }}
        >
          <HudBox>{ui.weapon} · {ui.ammo}</HudBox>
          <HudBox>HP {ui.health}</HudBox>
          <HudBox>Kills {ui.kills}</HudBox>
        </div>

        {/* Inventory bar */}
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 6,
          }}
        >
          {WEAPONS.map((w) => (
            <div
              key={w.id}
              onClick={() => {
                const s = stateRef.current;
                if (!s) return;
                if (s.player.weapon.name !== w.name) {
                  s.player.weapon = { ...w, ammo: w.maxAmmo };
                  setUi((u) => ({ ...u, weapon: w.name, ammo: w.maxAmmo }));
                }
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                background: ui.weapon === w.name ? "#ffc107" : "#2b2f36",
                color: "#fff",
                cursor: "pointer",
                fontSize: 12,
                border: "1px solid #444",
                userSelect: "none",
              }}
            >
              {w.name}
            </div>
          ))}
        </div>

        {/* Controls */}
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 8 }}>
          <Btn onClick={() => setRunning((v) => !v)}>
            {running ? "Pause" : (<><Play size={14} style={{ marginRight: 6 }} />Start</>)}
          </Btn>
          <Btn
            onClick={() => {
              setRunning(false);
              setTimeout(() => setRunning(true), 50);
            }}
          >
            <RotateCcw size={14} style={{ marginRight: 6 }} />
            Reset
          </Btn>
          <Btn onClick={() => setMuted((m) => !m)}>
            {muted ? <><VolumeX size={14} />&nbsp;Muted</> : <><Volume2 size={14} />&nbsp;Sound</>}
          </Btn>
        </div>

        {/* Helper legend */}
        <div
          style={{
            position: "absolute",
            left: 12,
            bottom: 12,
            padding: 12,
            borderRadius: 12,
            background: "rgba(0,0,0,0.45)",
            color: "#fff",
            fontFamily: "ui-sans-serif, system-ui",
            fontSize: 14,
            lineHeight: 1.5,
            maxWidth: 460,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Controls</div>
          <div>WASD: Move · Shift: Run · Mouse: Aim · LMB: Fire</div>
          <div>R: Reload · E: (not used in this cut) · 1–6: Quick Equip</div>
          <div>Space: Climb onto container (if overlapping). Space again to drop.</div>
          <div>Deathmatch: Enemies respawn. You respawn near safe zone.</div>
        </div>
      </div>
    </div>
  );
}

// ------------------------- UI bits -------------------------
const HudBox: React.FC<React.PropsWithChildren> = ({ children }) => (
  <div
    style={{
      background: "#2b2f36",
      padding: "8px 10px",
      borderRadius: 8,
      color: "#fff",
      fontWeight: 700,
      border: "1px solid #444",
    }}
  >
    {children}
  </div>
);

const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, ...props }) => (
  <button
    {...props}
    style={{
      background: "#2b2f36",
      color: "#fff",
      border: "1px solid #444",
      padding: "6px 10px",
      borderRadius: 6,
      display: "flex",
      alignItems: "center",
      cursor: "pointer",
      userSelect: "none",
    }}
  >
    {children}
  </button>
);
