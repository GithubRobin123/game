import React from "react";

const walls = [
  { pos: [0, 1, -10], size: [20, 2, 0.5] },
  { pos: [0, 1, 10], size: [20, 2, 0.5] },
  { pos: [10, 1, 0], size: [0.5, 2, 20] },
  { pos: [-10, 1, 0], size: [0.5, 2, 20] },
];

const ramps = [
  { pos: [-4, 0.2, -3], rot: [-Math.PI / 6, 0, 0], size: [4, 0.4, 2] },
];

const crates = [
  { pos: [3, 0.5, -2], size: [1.5, 1, 1.5] },
  { pos: [-2, 0.5, 2], size: [2, 1, 2] },
  { pos: [5, 0.5, 4], size: [1.2, 1, 1.2] },
];

export default function FPSMap() {
  return (
    <group>
      {walls.map((w, i) => (
        <mesh key={`w${i}`} position={w.pos} castShadow receiveShadow>
          <boxGeometry args={w.size} />
          <meshStandardMaterial color="#2f3542" />
        </mesh>
      ))}

      {ramps.map((r, i) => (
        <mesh
          key={`r${i}`}
          position={r.pos}
          rotation={r.rot}
          castShadow
          receiveShadow
        >
          <boxGeometry args={r.size} />
          <meshStandardMaterial color="#57606f" />
        </mesh>
      ))}

      {crates.map((b, i) => (
        <mesh key={`c${i}`} position={b.pos} castShadow receiveShadow>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color="#8B5A2B" />
        </mesh>
      ))}
    </group>
  );
}
