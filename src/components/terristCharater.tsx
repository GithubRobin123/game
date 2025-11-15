import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useRef, useEffect } from "react";

interface Character3DProps {
  position: THREE.Vector3;
  direction: THREE.Vector3;
  isMoving: boolean;
}

export default function Character3D({ position, direction, isMoving }: Character3DProps) {
  // Load your 3D model (replace with your own .glb file path)
  const { scene, animations } = useGLTF("/models/Sniper_Stand.glb") as any;
  const { actions } = useAnimations(animations, scene);
  const modelRef = useRef<THREE.Object3D>(scene);

  useEffect(() => {
  console.log("🎬 Available animations:", animations);
}, [animations]);

  // Basic idle/walk animations if your model supports them
  useEffect(() => {
    if (actions) {
      const walk = actions["Walk"] || actions["walk"];
      const idle = actions["Idle"] || actions["idle"];
      if (isMoving && walk) walk.play();
      else if (idle) idle.play();
    }
  }, [isMoving, actions]);

  

  useFrame(() => {
    if (modelRef.current) {
      modelRef.current.position.copy(position);
      // Rotate the character in movement direction
      if (direction.lengthSq() > 0.01) {
        const angle = Math.atan2(direction.x, direction.z);
        modelRef.current.rotation.y = angle;
      }
    }
  });

  return <primitive ref={modelRef} object={scene} scale={1.0} />;
}

useGLTF.preload("/models/Sniper_Stand.glb");
