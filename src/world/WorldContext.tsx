// src/world/WorldContext.tsx
import React, { createContext, useContext, useMemo, useRef, useState } from "react";
import * as THREE from "three";

export type AABB = { min: THREE.Vector3; max: THREE.Vector3 }; // axis-aligned box collider (world units)

type EnemyHandle = {
  id: string;
  mesh: THREE.Object3D;
  getHealth: () => number;
  setHealth: (v: number) => void;
};

type WorldCtx = {
  colliders: React.MutableRefObject<AABB[]>;
  registerEnemy: (h: EnemyHandle) => void;
  unregisterEnemy: (id: string) => void;
  enemies: React.MutableRefObject<Map<string, EnemyHandle>>;
  damageEnemyByRay: (origin: THREE.Vector3, dir: THREE.Vector3, damage: number) => string | null;
  kills: number;
  addKill: () => void;
};

const Ctx = createContext<WorldCtx | null>(null);

export const useWorld = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWorld must be inside <WorldProvider>");
  return v;
};

export const WorldProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const colliders = useRef<AABB[]>([]);
  const enemies = useRef<Map<string, EnemyHandle>>(new Map());
  const [kills, setKills] = useState(0);

  const registerEnemy = (h: EnemyHandle) => {
    enemies.current.set(h.id, h);
  };
  const unregisterEnemy = (id: string) => {
    enemies.current.delete(id);
  };

  // simple ray damage: pick closest intersected enemy by bounding box
  const damageEnemyByRay = (origin: THREE.Vector3, dir: THREE.Vector3, damage: number) => {
    let bestId: string | null = null;
    let bestDist = Infinity;

    enemies.current.forEach((h, id) => {
      // approximate with the mesh's world AABB
      const box = new THREE.Box3().setFromObject(h.mesh);
      // Ray/AABB hit test
      const ray = new THREE.Ray(origin, dir);
      const intersection = ray.intersectBox(box, new THREE.Vector3());
      if (intersection) {
        const d = origin.distanceTo(intersection);
        if (d < bestDist) {
          bestDist = d;
          bestId = id;
        }
      }
    });

    if (bestId) {
      const h = enemies.current.get(bestId)!;
      const hp = Math.max(0, h.getHealth() - damage);
      h.setHealth(hp);
      if (hp <= 0) setKills((k) => k + 1);
    }

    return bestId;
  };

  const addKill = () => setKills((k) => k + 1);

  const value = useMemo<WorldCtx>(
    () => ({ colliders, enemies, registerEnemy, unregisterEnemy, damageEnemyByRay, kills, addKill }),
    [kills]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
