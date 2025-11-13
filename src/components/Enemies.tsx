// src/components/Enemies.tsx
import { Html } from "@react-three/drei";
import { useThree, useFrame } from "@react-three/fiber";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useWorld } from "../world/WorldContext";

function Enemy({ id, start }: { id: string; start: THREE.Vector3 }) {
  const ref = useRef<THREE.Mesh>(null!);
  const [health, setHealth] = useState(100);
  const { registerEnemy, unregisterEnemy } = useWorld();
  const { camera } = useThree();

  useEffect(() => {
    registerEnemy({
      id,
      mesh: ref.current,
      getHealth: () => health,
      setHealth,
    });
    return () => unregisterEnemy(id);
  }, [id, registerEnemy, unregisterEnemy, health]);

  useEffect(() => {
    ref.current.position.copy(start);
  }, [start]);

  useFrame((_, dt) => {
    if (!ref.current) return;
    if (health <= 0) return;
    // simple chase AI
    const toCam = new THREE.Vector3().subVectors(camera.position, ref.current.position);
    toCam.y = 0;
    const d = toCam.length();
    if (d > 0.01) {
      toCam.normalize();
      ref.current.position.addScaledVector(toCam, Math.min(2.5 * dt, d));
      ref.current.lookAt(camera.position.x, ref.current.position.y, camera.position.z);
    }
  });

  if (health <= 0) return null;

  return (
    <group>
      <mesh ref={ref} castShadow receiveShadow>
        <boxGeometry args={[0.8, 1.8, 0.8]} />
        <meshStandardMaterial color="#c0392b" />
      </mesh>

      {/* Floating HP bar */}
      <Html center position={[start.x, start.y + 2.2, start.z]} transform>
        <div style={{
          transform: "translate(-50%, -100%)",
          background: "rgba(0,0,0,0.55)",
          padding: "2px 6px",
          borderRadius: 6,
          color: "#fff",
          fontSize: 12,
          minWidth: 60
        }}>
          HP {health}
        </div>
      </Html>
    </group>
  );
}

export default function Enemies({ count = 6 }: { count?: number }) {
  const starts = useMemo(() => {
    const s: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      s.push(new THREE.Vector3((i - count / 2) * 3.5, 0, -12 - (i % 3) * 3));
    }
    return s;
  }, [count]);

  return (
    <>
      {starts.map((v, i) => (
        <Enemy key={i} id={`enemy-${i}`} start={v} />
      ))}
    </>
  );
}
