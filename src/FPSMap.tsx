// src/FPSMap.tsx
import * as THREE from "three";
import { useEffect } from "react";
import { useWorld } from "./world/WorldContext";

function addAABB(list: THREE.Box3[], min: [number, number, number], max: [number, number, number]) {
  list.push(new THREE.Box3(new THREE.Vector3(...min), new THREE.Vector3(...max)));
}

export default function FPSMap() {
  const { colliders } = useWorld();

  useEffect(() => {
    // build AABBs once (floor + crates). Units roughly meters.
    const aabbs: THREE.Box3[] = [];

    // Floor (50×50, 1 thick). Top at y=0.
    addAABB(aabbs, [-25, -1, -25], [25, 0, 25]);

    // Containers: big, medium, small (like steps)
    // You can rearrange these positions freely; they become climbable platforms.
    // 1) lower base
    addAABB(aabbs, [-6, 0, -10], [-2, 1.2, -6]);     // height ≈1.2
    // 2) above base but smaller footprint (stair to higher)
    addAABB(aabbs, [-5.5, 1.2, -9.5], [-3.0, 2.2, -7.2]); // height ≈2.2
    // 3) another standalone box
    addAABB(aabbs, [4, 0, -6], [8, 1.6, -2]);        // height ≈1.6
    // 4) tall box
    addAABB(aabbs, [10, 0, 6], [14, 2.4, 10]);       // height ≈2.4

    // commit to world colliders
    colliders.current = aabbs.map((b) => ({ min: b.min.clone(), max: b.max.clone() }));
  }, [colliders]);

  return (
    <>
      {/* Floor */}
      <mesh receiveShadow position={[0, -0.5, 0]}>
        <boxGeometry args={[50, 1, 50]} />
        <meshStandardMaterial color="#1f2126" />
      </mesh>

      {/* Visual debug of containers (same sizes as AABBs above) */}
      <mesh castShadow receiveShadow position={[-4, 0.6, -8]}>
        <boxGeometry args={[4, 1.2, 4]} />
        <meshStandardMaterial color="#2e5b7d" />
      </mesh>

      <mesh castShadow receiveShadow position={[-4.25, 1.7, -8.35]}>
        <boxGeometry args={[2.5, 1, 2.3]} />
        <meshStandardMaterial color="#2a4861" />
      </mesh>

      <mesh castShadow receiveShadow position={[6, 0.8, -4]}>
        <boxGeometry args={[4, 1.6, 4]} />
        <meshStandardMaterial color="#34495e" />
      </mesh>

      <mesh castShadow receiveShadow position={[12, 1.2, 8]}>
        <boxGeometry args={[4, 2.4, 4]} />
        <meshStandardMaterial color="#3c6e71" />
      </mesh>
    </>
  );
}
