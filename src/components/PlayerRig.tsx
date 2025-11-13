import { PointerLockControls } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useEffect, useMemo, useRef, useState } from "react";
import { useWorld } from "../world/WorldContext";
import Character3D from "./terristCharater";

// ✅ Sound imports
import akmUrl from "../sounds/akm.mp3";
import awmUrl from "../sounds/awm.mp3";
import m416Url from "../sounds/m416.mp3";

// ✅ Constants
const tmpVec = new THREE.Vector3();
const GRAVITY = 18;
const JUMP_VELOCITY = 7.2;
const STEP_HEIGHT = 1.0;
const RADIUS = 0.35;
const EYE = 1.6;
const FIRE_RATES: Record<string, number> = { AKM: 600, M416: 700, AWM: 45 };
const DAMAGE: Record<string, number> = { AKM: 35, M416: 28, AWM: 95 };

export default function PlayerRig() {
  const { camera, gl } = useThree();
  const { colliders, damageEnemyByRay } = useWorld();

  const [locked, setLocked] = useState(false);
  const [onGround, setOnGround] = useState(true);

  // ✅ Character visual tracking
  const playerPos = useRef(new THREE.Vector3(0, EYE, 5));
  const playerDir = useRef(new THREE.Vector3());
  const [isMoving, setIsMoving] = useState(false);

  const velocity = useRef(new THREE.Vector3());
  const fireCooldown = useRef(0);
  const currentWeapon = useRef<"AKM" | "M416" | "AWM">("AKM");

  // ✅ Load weapon sounds
  const audio = useMemo(() => {
    const map = {
      AKM: new Audio(akmUrl),
      M416: new Audio(m416Url),
      AWM: new Audio(awmUrl),
    };
    Object.values(map).forEach((a) => (a.volume = 0.5));
    return map;
  }, []);

  // ✅ Key input handling
  const keys = useRef<{ [k: string]: boolean }>({});
  useEffect(() => {
    const dn = (e: KeyboardEvent) => (keys.current[e.key.toLowerCase()] = true);
    const up = (e: KeyboardEvent) => (keys.current[e.key.toLowerCase()] = false);
    window.addEventListener("keydown", dn);
    window.addEventListener("keyup", up);
    camera.position.set(0, EYE, 5);
    return () => {
      window.removeEventListener("keydown", dn);
      window.removeEventListener("keyup", up);
    };
  }, [camera]);

  // ✅ Get ground height for collision
  const groundYAt = (x: number, z: number) => {
    let gy = -Infinity;
    for (const b of colliders.current) {
      if (x >= b.min.x - RADIUS && x <= b.max.x + RADIUS && z >= b.min.z - RADIUS && z <= b.max.z + RADIUS) {
        gy = Math.max(gy, b.max.y);
      }
    }
    return gy;
  };

  // ✅ Collision resolve
  const resolveHorizontalPenetration = (pos: THREE.Vector3) => {
    for (const b of colliders.current) {
      const minY = b.min.y - 0.1;
      const maxY = b.max.y + EYE;
      if (pos.y < minY || pos.y > maxY) continue;
      const clampedX = THREE.MathUtils.clamp(pos.x, b.min.x, b.max.x);
      const clampedZ = THREE.MathUtils.clamp(pos.z, b.min.z, b.max.z);
      const dx = pos.x - clampedX;
      const dz = pos.z - clampedZ;
      const distSq = dx * dx + dz * dz;
      if (distSq < RADIUS * RADIUS) {
        const d = Math.sqrt(distSq) || 0.00001;
        const nx = (dx / d) * (RADIUS - d);
        const nz = (dz / d) * (RADIUS - d);
        pos.x += nx;
        pos.z += nz;
      }
    }
  };

  // ✅ Step-up logic
  const tryStepUp = (posBefore: THREE.Vector3, posAfter: THREE.Vector3) => {
    const feetYBefore = posBefore.y - EYE;
    const gy = groundYAt(posAfter.x, posAfter.z);
    if (gy === -Infinity) return;
    const rise = gy - feetYBefore;
    if (rise > 0 && rise <= STEP_HEIGHT) {
      posAfter.y = gy + EYE;
      setOnGround(true);
      velocity.current.y = 0;
    }
  };

  // ✅ Shooting logic
  const shoot = () => {
    const w = currentWeapon.current;
    const rpm = FIRE_RATES[w];
    const perShot = 60 / rpm;
    const now = performance.now() * 0.001;
    if (now < fireCooldown.current) return;
    fireCooldown.current = now + perShot;
    const a = audio[w];
    try {
      a.currentTime = 0;
      a.play();
    } catch {}
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const dir = camera.getWorldDirection(new THREE.Vector3()).normalize();
    damageEnemyByRay(origin, dir, DAMAGE[w]);
  };

  // ✅ Mouse fire flag
  const mouseDown = useRef(false);
  useEffect(() => {
    const dom = gl.domElement;
    const md = () => (mouseDown.current = true);
    const mu = () => (mouseDown.current = false);
    dom.addEventListener("mousedown", md);
    window.addEventListener("mouseup", mu);
    return () => {
      dom.removeEventListener("mousedown", md);
      window.removeEventListener("mouseup", mu);
    };
  }, [gl.domElement]);

  // ✅ Unified useFrame (handles everything)
  useFrame((_, dt) => {
    if (!locked) return;

    // --- Movement ---
    const pos = camera.position.clone();
    const forward = camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const right = new THREE.Vector3().copy(forward).cross(camera.up).normalize();
    const speed = keys.current["shift"] ? 7.5 : 4.2;

    let dirH = new THREE.Vector3();
    if (keys.current["w"]) dirH.add(forward);
    if (keys.current["s"]) dirH.add(forward.clone().multiplyScalar(-1));
    if (keys.current["a"]) dirH.add(right.clone().multiplyScalar(-1));
    if (keys.current["d"]) dirH.add(right);

    if (dirH.lengthSq() > 0) dirH.normalize().multiplyScalar(speed * dt);

    const after = pos.clone().add(dirH);
    tryStepUp(pos, after);
    pos.copy(after);

    // --- Gravity ---
    velocity.current.y -= GRAVITY * dt;
    pos.y += velocity.current.y * dt;

    // --- Ground / falling ---
    const gy = groundYAt(pos.x, pos.z);
    if (gy !== -Infinity) {
      const feetY = pos.y - EYE;
      if (feetY <= gy) {
        pos.y = gy + EYE;
        velocity.current.y = 0;
        if (!onGround) setOnGround(true);
      } else {
        if (onGround) setOnGround(false);
      }
    }

    // --- Collision ---
    resolveHorizontalPenetration(pos);

    // --- Jump ---
    if (keys.current[" "] && onGround) {
      setOnGround(false);
      velocity.current.y = JUMP_VELOCITY;
    }

    // --- Commit camera ---
    camera.position.copy(pos);

    // --- Fire ---
    if (mouseDown.current) shoot();

    // --- Update character visuals ---
    setIsMoving(dirH.lengthSq() > 0.0001);
    playerPos.current.copy(pos);
    playerDir.current.copy(dirH.clone().normalize());
  });

  // ✅ Weapon switching
  useEffect(() => {
    const onNum = (e: KeyboardEvent) => {
      if (e.key === "1") currentWeapon.current = "AKM";
      if (e.key === "2") currentWeapon.current = "M416";
      if (e.key === "3") currentWeapon.current = "AWM";
    };
    window.addEventListener("keydown", onNum);
    return () => window.removeEventListener("keydown", onNum);
  }, []);

  // ✅ Render Player Controls + Visible Character
  return (
    <>
      <PointerLockControls onLock={() => setLocked(true)} onUnlock={() => setLocked(false)} />
      <Character3D position={playerPos.current} direction={playerDir.current} isMoving={isMoving} />
    </>
  );
}
