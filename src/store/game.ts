import { create } from "zustand";
import * as THREE from "three";

export type Weapon = {
  name: string;
  damage: number;
  fireRate: number; // ms between shots
  ammo: number;
  maxAmmo: number;
  reloadTime: number;
};

export const WEAPONS: Weapon[] = [
  { name: "AKM", damage: 35, fireRate: 120, ammo: 30, maxAmmo: 30, reloadTime: 1800 },
  { name: "M416", damage: 28, fireRate: 100, ammo: 40, maxAmmo: 40, reloadTime: 2000 },
  { name: "AWM", damage: 95, fireRate: 1100, ammo: 5, maxAmmo: 5, reloadTime: 2800 },
];

export type EnemyState = {
  id: string;
  ref?: THREE.Mesh;        // registered by component
  pos: THREE.Vector3;
  rotY: number;
  health: number;
  maxHealth: number;
  lastShot: number;
  alive: boolean;
};

type GameState = {
  running: boolean;
  muted: boolean;

  // player
  playerHP: number;
  playerMaxHP: number;
  kills: number;

  weapon: Weapon;
  isReloading: boolean;
  reloadStart: number;
  lastShot: number;

  // enemies
  enemies: Record<string, EnemyState>;

  // API
  setRunning(v: boolean): void;
  setMuted(v: boolean): void;

  registerEnemy(id: string, mesh: THREE.Mesh): void;
  unregisterEnemy(id: string): void;

  damagePlayer(dmg: number): void;
  healPlayerToFull(): void;

  damageEnemy(id: string, dmg: number): void;
  killEnemy(id: string): void;
  respawnEnemy(id: string, to: THREE.Vector3): void;

  canShoot(): boolean;
  consumeShot(): void;

  shootFrom(origin: THREE.Vector3, dir: THREE.Vector3): string | null;
  reload(): void;
  finishReload(): void;

  equip(w: Weapon): void;
};

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export const useGame = create<GameState>((set, get) => ({
  running: true,
  muted: false,

  playerHP: 100,
  playerMaxHP: 100,
  kills: 0,

  weapon: { ...WEAPONS[0] },
  isReloading: false,
  reloadStart: 0,
  lastShot: 0,

  enemies: {},

  setRunning: (v) => set({ running: v }),
  setMuted: (v) => set({ muted: v }),

  registerEnemy: (id, mesh) =>
    set((s) => {
      const e = s.enemies[id];
      if (!e) return s;
      return { enemies: { ...s.enemies, [id]: { ...e, ref: mesh } } };
    }),

  unregisterEnemy: (id) =>
    set((s) => {
      const n = { ...s.enemies };
      delete n[id];
      return { enemies: n };
    }),

  damagePlayer: (dmg) =>
    set((s) => {
      const hp = clamp(s.playerHP - dmg, 0, s.playerMaxHP);
      return { playerHP: hp };
    }),

  healPlayerToFull: () => set((s) => ({ playerHP: s.playerMaxHP })),

  damageEnemy: (id, dmg) =>
    set((s) => {
      const e = s.enemies[id];
      if (!e || !e.alive) return s;
      const hp = Math.max(0, e.health - dmg);
      return { enemies: { ...s.enemies, [id]: { ...e, health: hp } } };
    }),

  killEnemy: (id) =>
    set((s) => {
      const e = s.enemies[id];
      if (!e) return s;
      return {
        kills: s.kills + 1,
        enemies: { ...s.enemies, [id]: { ...e, alive: false } },
      };
    }),

  respawnEnemy: (id, to) =>
    set((s) => {
      const e = s.enemies[id];
      if (!e) return s;
      return {
        enemies: {
          ...s.enemies,
          [id]: {
            ...e,
            pos: to.clone(),
            health: e.maxHealth,
            alive: true,
          },
        },
      };
    }),

  canShoot: () => {
    const { isReloading, weapon, lastShot } = get();
    const t = performance.now();
    return !isReloading && t - lastShot >= weapon.fireRate && weapon.ammo > 0;
  },

  consumeShot: () =>
    set((s) => ({
      lastShot: performance.now(),
      weapon: { ...s.weapon, ammo: s.weapon.ammo - 1 },
    })),

  // Hitscan:
  shootFrom: (origin, dir) => {
    const { enemies, weapon } = get();

    // collect enemy meshes
    const meshes: THREE.Object3D[] = [];
    const idByUuid: Record<string, string> = {};
    Object.values(enemies).forEach((e) => {
      if (e.alive && e.ref) {
        meshes.push(e.ref);
        idByUuid[e.ref.uuid] = e.id;
      }
    });
    if (meshes.length === 0) return null;

    // build BVH-like list and intersect
    const ray = new THREE.Raycaster();
    ray.set(origin, dir.normalize());
    ray.far = 120; // weapon range

    const hits = ray.intersectObjects(meshes, false);
    if (hits.length === 0) return null;

    const hit = hits[0];
    const enemyId = idByUuid[hit.object.uuid];
    if (!enemyId) return null;

    // apply damage
    get().damageEnemy(enemyId, weapon.damage);
    const e = get().enemies[enemyId];
    if (e && e.health <= 0) {
      get().killEnemy(enemyId);
      // respawn after 1.5s
      setTimeout(() => {
        const spawn = new THREE.Vector3(
          (Math.random() - 0.5) * 40,
          0,
          (Math.random() - 0.5) * 40
        );
        get().respawnEnemy(enemyId, spawn);
      }, 1500);
    }
    return enemyId;
  },

  reload: () => {
    const { isReloading, weapon } = get();
    if (isReloading || weapon.ammo >= weapon.maxAmmo) return;
    set({ isReloading: true, reloadStart: performance.now() });
  },

  finishReload: () => {
    const { isReloading, reloadStart, weapon } = get();
    if (!isReloading) return;
    if (performance.now() - reloadStart >= weapon.reloadTime) {
      set({ weapon: { ...weapon, ammo: weapon.maxAmmo }, isReloading: false });
    }
  },

  equip: (w) => set({ weapon: { ...w, ammo: w.maxAmmo } }),
}));

// Helpers to seed N enemies at start
export const makeEnemySeed = (n = 6): Record<string, EnemyState> => {
  const out: Record<string, EnemyState> = {};
  for (let i = 0; i < n; i++) {
    const id = `E${i}`;
    out[id] = {
      id,
      pos: new THREE.Vector3((Math.random() - 0.5) * 40, 0, (Math.random() - 0.5) * 40),
      rotY: 0,
      health: 100,
      maxHealth: 100,
      lastShot: 0,
      alive: true,
    };
  }
  return out;
};
