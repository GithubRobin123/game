import { GAME_CONFIG, GUN_SVGS, clamp, dist, now } from "./config";
import type { ExtendedImage, WorldState, Weapon, Enemy, Bullet, CameraLike } from "./types";
import { useGameStore } from "../store/useGameStore";

// sounds (place your mp3s in src/sounds)
import akm from "../sounds/akm.mp3";
import m416 from "../sounds/m416.mp3";
import awm from "../sounds/awm.mp3";
import uzi from "../sounds/akm.mp3";

import { drawAmmoBox, drawCharacter, drawWarehouseBackground, draw3DContainers, drawWeaponPickup } from "./draw";

export const WEAPONS: Weapon[] = [
  { id: 1, name: "AKM", damage: 35, fireRate: 120, ammo: 30, maxAmmo: 30, reloadTime: 1800 },
  { id: 2, name: "M416", damage: 28, fireRate: 100, ammo: 40, maxAmmo: 40, reloadTime: 2000 },
  { id: 3, name: "AWM", damage: 95, fireRate: 1100, ammo: 5, maxAmmo: 5, reloadTime: 2800 },
  { id: 4, name: "UZI", damage: 22, fireRate: 60, ammo: 35, maxAmmo: 35, reloadTime: 1400 },
  { id: 5, name: "Kar98k", damage: 85, fireRate: 1000, ammo: 5, maxAmmo: 5, reloadTime: 2600 },
  { id: 6, name: "SCAR-L", damage: 30, fireRate: 110, ammo: 30, maxAmmo: 30, reloadTime: 1900 },
];

const GUN_SOUNDS = { AKM: akm, M416: m416, UZI: uzi, AWM: awm };

export class GameEngine {
  public state: WorldState;
  private walkCycle = 0;
  private gunImgCache: Record<string, ExtendedImage> = {};
  private audioCache: Record<string, HTMLAudioElement> = {};
  private last = performance.now();
  private raf: number | null = null;
  private isMasterUpdater = false; // only one view should drive update()

  constructor() {
    this.state = this.makeFreshWorld();
    this.preloadImages();
    this.preloadAudio();

    // expose a couple of actions to UI via Zustand
    useGameStore.setState({
      requestEquip: (w) => this.equip(this.state.player, typeof w === "string" ? WEAPONS.find(x => x.name === w)! : w),
      requestReset: () => this.reset()
    });
  }

  private makeFreshWorld(): WorldState {
    const s: WorldState = {
      player: {
        x: 1600, y: 1100, rot: 0,
        health: GAME_CONFIG.character.health, maxHealth: GAME_CONFIG.character.health,
        weapon: { ...WEAPONS[0] },
        isReloading: false, reloadStart: 0, lastShot: 0,
        kills: 0, isOnContainer: false
      },
      bullets: [],
      enemies: [],
      pickups: { weapons: [], ammo: [] },
      containers: [],
      cameraMain: { x: 0, y: 0 },
      mouse: { x: 0, y: 0, wx: 0, wy: 0, down: false },
      keys: {},
    };

    // weapons on tables
    const tables = [
      { x: 520, y: 420 },{ x: 2300, y: 420 },{ x: 1250, y: 1500 },{ x: 1850, y: 850 }
    ];
    tables.forEach((t) => WEAPONS.slice(0, 2).forEach((g, i) =>
      s.pickups.weapons.push({ x: t.x + i * 90, y: t.y, weapon: { ...g, ammo: g.maxAmmo } })
    ));

    const ammoXs = [640, 2100, 1520, 820, 2280, 420];
    const ammoYs = [640, 620, 1250, 1580, 1240, 1020];
    ammoXs.forEach((x, i) => s.pickups.ammo.push({ x, y: ammoYs[i], amount: 30 }));

    s.containers = [
      { x: 300, y: 300, w: 180, h: 180 },{ x: 2600, y: 380, w: 180, h: 180 },
      { x: 1400, y: 600, w: 240, h: 120 },{ x: 700, y: 1320, w: 200, h: 200 },
      { x: 2350, y: 1600, w: 180, h: 180 },{ x: 1050, y: 820, w: 120, h: 220 },
      { x: 1700, y: 1000, w: 300, h: 140 },{ x: 1900, y: 1500, w: 160, h: 240 },
    ];

    const spots = [[420,520],[2500,520],[1520,1680],[820,1420],[2250,1360],[2800,900],[500,1800]];
    for (let i = 0; i < 7; i++) {
      const spt = spots[i % spots.length];
      const e: Enemy = {
        x: spt[0], y: spt[1], rot: 0,
        health: GAME_CONFIG.enemy.health, maxHealth: GAME_CONFIG.enemy.health,
        lastShot: 0, state: "patrol", weapon: { ...WEAPONS[i % 4] },
        isReloading: false, reloadStart: 0,
      } as Enemy;
      s.enemies.push(e);
    }

    return s;
  }

  private preloadImages() {
    const cache: Record<string, ExtendedImage> = {};
    Object.keys(GUN_SVGS).forEach((k) => {
      const img = new Image() as ExtendedImage;
      img._loaded = false; img._broken = false; img._handlersSet = true;
      img.onload = () => { img._loaded = true; img._broken = false; };
      img.onerror = () => { img._broken = true; };
      img.src = GUN_SVGS[k]; cache[k] = img;
    });
    this.gunImgCache = cache;
  }

  private preloadAudio() {
    const cache: Record<string, HTMLAudioElement> = {};
    Object.entries(GUN_SOUNDS).forEach(([name, url]) => {
      const a = new Audio(url); a.preload = "auto"; cache[name] = a;
    });
    this.audioCache = cache;
  }

  // ----- controls, input -----
  attachKeyboardListeners() {
    const onKey = (e: KeyboardEvent, down: boolean) => {
      const key = e.key.toLowerCase();
      this.state.keys[key] = down;
      if (down && e.key === " ") { e.preventDefault(); this.jump(); }
      if (down && key === "r") this.reload(this.state.player);
      if (down && /^[1-6]$/.test(e.key)) {
        const w = WEAPONS[Number(e.key) - 1]; if (w) this.equip(this.state.player, w);
      }
    };
    const kd = (e: KeyboardEvent) => onKey(e, true);
    const ku = (e: KeyboardEvent) => onKey(e, false);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => { window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }

  updateMouseFromCanvas(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const r = canvas.getBoundingClientRect();
    this.state.mouse.x = clientX - r.left;
    this.state.mouse.y = clientY - r.top;
  }
  mouseDown = () => (this.state.mouse.down = true);
  mouseUp   = () => (this.state.mouse.down = false);

  // ----- actions -----
  private playGun(w: Weapon) {
    if (useGameStore.getState().muted) return;
    const key = w.name in this.audioCache ? w.name : "AKM";
    const a = this.audioCache[key]?.cloneNode(true) as HTMLAudioElement;
    if (!a) return; a.volume = 0.35; a.play().catch(() => {});
  }

  private jump() {
    const p = this.state.player;
    for (const c of this.state.containers) {
      if (p.x > c.x && p.x < c.x + c.w && p.y > c.y && p.y < c.y + c.h + 15) {
        p.y = c.y - 10; p.isOnContainer = true; return;
      }
    }
    if (p.isOnContainer) { p.y += 50; p.isOnContainer = false; }
  }

  private reload(a: any) {
    if (a.isReloading || a.weapon.ammo >= a.weapon.maxAmmo) return;
    a.isReloading = true; a.reloadStart = now();
  }
  private finishReload(a: any) {
    if (!a.isReloading) return;
    if (now() - a.reloadStart >= a.weapon.reloadTime) { a.weapon.ammo = a.weapon.maxAmmo; a.isReloading = false; }
  }
  private equip(a: any, w: Weapon) { a.weapon = { ...w, ammo: w.maxAmmo }; }

  private shoot(a: any) {
    const t = now();
    if (a.isReloading || t - a.lastShot < a.weapon.fireRate || a.weapon.ammo <= 0) return;
    a.lastShot = t; a.weapon.ammo--; this.playGun(a.weapon);
    const c = Math.cos(a.rot), s = Math.sin(a.rot);
    this.state.bullets.push({ x: a.x + c * 38, y: a.y + s * 38, vx: c * GAME_CONFIG.bullet.speed, vy: s * GAME_CONFIG.bullet.speed, life: 0, owner: a });
  }

  private moveAndCollide(x: number, y: number, vx: number, vy: number) {
    let nx = x + vx, ny = y + vy;
    nx = clamp(nx, 58, GAME_CONFIG.world.width - 58);
    ny = clamp(ny, 58, GAME_CONFIG.world.height - 58);
    for (const c of this.state.containers) {
      if (nx > c.x - 8 && nx < c.x + c.w + 8 && ny > c.y - 8 && ny < c.y + c.h + 8) {
        const dL = Math.abs(nx - (c.x - 8));
        const dR = Math.abs(nx - (c.x + c.w + 8));
        const dT = Math.abs(ny - (c.y - 8));
        const dB = Math.abs(ny - (c.y + c.h + 8));
        const m = Math.min(dL, dR, dT, dB);
        if (m === dL) nx = c.x - 8; else if (m === dR) nx = c.x + c.w + 8;
        else if (m === dT) ny = c.y - 8; else ny = c.y + c.h + 8;
      }
    }
    return { x: nx, y: ny };
  }

  private damage(a: any, d: number) { a.health -= d; if (a.health <= 0) this.death(a); }
  private death(a: any) {
    if (a === this.state.player) {
      this.state.player.x = 600; this.state.player.y = 1200;
      this.state.player.health = this.state.player.maxHealth; this.equip(this.state.player, WEAPONS[0]);
    } else {
      this.state.player.kills++; a.x = 2800; a.y = 900; a.health = a.maxHealth;
    }
  }

  // ----- update / tick -----
  stepUpdate() {
    const t = performance.now();
    const dt = Math.min((t - this.last) / 16.67, 2);
    this.last = t;

    const p = this.state.player;
    const k = this.state.keys;
    const speed = k.shift ? GAME_CONFIG.character.runSpeed : GAME_CONFIG.character.walkSpeed;

    let vx = (k.a ? -speed : 0) + (k.d ? speed : 0);
    let vy = (k.w ? -speed : 0) + (k.s ? speed : 0);
    if (vx && vy) { vx *= 0.7071; vy *= 0.7071; }
    const pos = this.moveAndCollide(p.x, p.y, vx, vy);
    if (vx || vy) this.walkCycle += 0.18;
    p.x = pos.x; p.y = pos.y;

    p.rot = Math.atan2(this.state.mouse.wy - p.y, this.state.mouse.wx - p.x);
    if (this.state.mouse.down) this.shoot(p);
    this.finishReload(p);

    // bullets
    for (let i = this.state.bullets.length - 1; i >= 0; i--) {
      const b = this.state.bullets[i];
      b.x += b.vx; b.y += b.vy; b.life += Math.hypot(b.vx, b.vy);
      if (b.x < 58 || b.x > GAME_CONFIG.world.width - 58 || b.y < 58 || b.y > GAME_CONFIG.world.height - 58) { this.state.bullets.splice(i, 1); continue; }
      if (b.owner !== p && dist(b.x, b.y, p.x, p.y) < GAME_CONFIG.character.radius) { this.damage(p, b.owner.weapon.damage); this.state.bullets.splice(i, 1); continue; }
      if (b.owner === p) {
        for (const e of this.state.enemies) {
          if (dist(b.x, b.y, e.x, e.y) < GAME_CONFIG.character.radius) { this.damage(e, p.weapon.damage); this.state.bullets.splice(i, 1); break; }
        }
      }
      if (b.life > GAME_CONFIG.bullet.maxDistance) this.state.bullets.splice(i, 1);
    }

    // main camera follows mouse a bit
    this.state.cameraMain.x = clamp(
      p.x - GAME_CONFIG.canvas.width / 2 + (this.state.mouse.x - GAME_CONFIG.canvas.width / 2) * 0.2,
      0, GAME_CONFIG.world.width - GAME_CONFIG.canvas.width
    );
    this.state.cameraMain.y = clamp(
      p.y - GAME_CONFIG.canvas.height / 2 + (this.state.mouse.y - GAME_CONFIG.canvas.height / 2) * 0.2,
      0, GAME_CONFIG.world.height - GAME_CONFIG.canvas.height
    );
    this.state.mouse.wx = this.state.mouse.x + this.state.cameraMain.x;
    this.state.mouse.wy = this.state.mouse.y + this.state.cameraMain.y;

    // HUD update
    useGameStore.getState().setUI({
      kills: p.kills, health: Math.max(0, Math.round(p.health)), ammo: p.weapon.ammo, weapon: p.weapon.name,
    });
  }

  // draw world with arbitrary camera + scale (used by 3 views)
  render(ctx: CanvasRenderingContext2D, camera: CameraLike) {
    const { x, y, scale = 1 } = camera;
    ctx.save();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.scale(scale, scale);
    ctx.translate(-x, -y);

    drawWarehouseBackground(ctx);
    draw3DContainers(ctx, this.state);

    this.state.pickups.weapons.forEach((w) => drawWeaponPickup(ctx, this.gunImgCache, w.x, w.y, w.weapon.name));
    this.state.pickups.ammo.forEach((a) => drawAmmoBox(ctx, a.x, a.y));

    ctx.fillStyle = "#ffd54f";
    this.state.bullets.forEach((b) => { ctx.beginPath(); ctx.arc(b.x, b.y, GAME_CONFIG.bullet.size, 0, Math.PI * 2); ctx.fill(); });

    this.state.enemies.forEach((e) => drawCharacter(ctx, this.gunImgCache, this.state, e.x, e.y, e.rot, false, e.health / e.maxHealth, this.walkCycle));
    drawCharacter(ctx, this.gunImgCache, this.state, this.state.player.x, this.state.player.y, this.state.player.rot, true, this.state.player.health / this.state.player.maxHealth, this.walkCycle);

    ctx.restore();
  }

  // master loop (called by Top view only)
  startMasterLoop(renderAll: () => void) {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.isMasterUpdater = true;
    const loop = () => {
      if (useGameStore.getState().running) {
        this.stepUpdate();
        renderAll();
        useGameStore.getState().bumpFrame();
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  stopMasterLoop() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; this.isMasterUpdater = false; }

  reset() {
    this.state = this.makeFreshWorld();
  }
}
