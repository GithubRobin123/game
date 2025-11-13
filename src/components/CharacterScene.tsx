import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Sky } from "@react-three/drei";
import CharacterController from "./CharacterController";
import React from "react";

export default function CharacterScene() {
  return (
    <Canvas shadows camera={{ position: [0, 3, 8], fov: 50 }}>
      <Sky sunPosition={[100, 20, 100]} />
      <Environment preset="sunset" />
      <ambientLight intensity={0.3} />
      <directionalLight intensity={1} position={[10, 10, 5]} castShadow />

      {/* TEMP: floor */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#707070" />
      </mesh>

      <CharacterController />
      <OrbitControls enableZoom={false} enableRotate={false} />
    </Canvas>
  );
}
