// src/components/GameScene.tsx
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Sky } from "@react-three/drei";
import CharacterController from "./modelcontroller";

export default function GameScene() {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 3, 8], fov: 60 }}
      style={{ width: "100vw", height: "100vh", background: "#88ccee" }}
    >
      {/* Lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 10, 5]} intensity={1} castShadow />

      {/* Sky */}
      <Sky sunPosition={[100, 10, 100]} />

      {/* Ground */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#228B22" />
      </mesh>

      {/* Character */}
      <CharacterController url="/models/enemy.glb" />

      {/* Orbit for debugging */}
      <OrbitControls target={[0, 1, 0]} />
    </Canvas>
  );
}
