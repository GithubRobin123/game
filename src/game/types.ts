export type Weapon = {
  id: number;
  name: string;
  damage: number;
  fireRate: number;
  ammo: number;
  maxAmmo: number;
  reloadTime: number;
};

export type CameraLike = {
  x: number;
  y: number;
  scale?: number; // 1 = default
};

export interface ExtendedImage extends HTMLImageElement {
  _loaded?: boolean;
  _broken?: boolean;
  _handlersSet?: boolean;
}

export type Player = {
  x: number; y: number; rot: number;
  health: number; maxHealth: number;
  weapon: Weapon;
  isReloading: boolean; reloadStart: number; lastShot: number;
  kills: number; isOnContainer: boolean;
};

export type Enemy = Omit<Player, "kills" | "isOnContainer"> & {
  state: "patrol" | "chase";
};

export type Bullet = {
  x: number; y: number; vx: number; vy: number; life: number; owner: Player | Enemy;
};

export type WorldState = {
  player: Player;
  enemies: Enemy[];
  bullets: Bullet[];
  pickups: { weapons: Array<{x:number;y:number;weapon:Weapon}>, ammo: Array<{x:number;y:number;amount:number}> };
  containers: Array<{x:number;y:number;w:number;h:number}>
  cameraMain: { x: number; y: number };
  mouse: { x: number; y: number; wx: number; wy: number; down: boolean };
  keys: Record<string, boolean>;
};
