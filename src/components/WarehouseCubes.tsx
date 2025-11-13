import React from "react";
import { GroupProps } from "@react-three/fiber";

export default function WarehouseCubes(props: GroupProps) {
  const crates = [
    { pos: [2, 0.5, -2], size: [1.6, 1, 1.6], color: "#8B4513" },
    { pos: [-3, 0.5, 1], size: [2, 1, 2], color: "#7A3E2D" },
    { pos: [4, 0.5, 3], size: [1.5, 1, 1.5], color: "#8B6F47" },
    { pos: [0, 0.5, 4], size: [2.5, 1.2, 2], color: "#A17F52" },
    { pos: [-4, 0.5, -4], size: [2, 1, 1.5], color: "#6E4C2B" },
  ];

  return (
    <group {...props}>
      {crates.map((b, i) => (
        <mesh key={i} position={b.pos} castShadow receiveShadow>
          <boxGeometry args={b.size} />
          <meshStandardMaterial color={b.color} />
        </mesh>
      ))}
    </group>
  );
}
