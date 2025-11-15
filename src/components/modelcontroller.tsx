// src/components/CharacterController.tsx
import { useGLTF, useAnimations } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import React, { useRef, useEffect, useState } from "react";

interface CharacterControllerProps {
  url: string;
}

export default function CharacterController({ url }: CharacterControllerProps) {
  const group = useRef<THREE.Group>(null!);
  const { scene, animations } = useGLTF(url);
  const { actions, mixer } = useAnimations(animations, group);

  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const [currentAction, setCurrentAction] = useState<string>("idle");
  const speed = 0.08;

  // Capture key presses
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => setKeys((k) => ({ ...k, [e.key.toLowerCase()]: true }));
    const handleKeyUp = (e: KeyboardEvent) => setKeys((k) => ({ ...k, [e.key.toLowerCase()]: false }));

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // Animation switching helper
  const playAction = (name: string) => {
    if (currentAction === name) return;
    const next = actions[name];
    const prev = actions[currentAction];
    prev?.fadeOut(0.2);
    next?.reset().fadeIn(0.2).play();
    setCurrentAction(name);
  };

  // Initialize default animation (idle)
  useEffect(() => {
    if (!animations.length) return;
    const firstAnim = animations[0].name;
    actions[firstAnim]?.play();
    setCurrentAction(firstAnim);
  }, [actions, animations]);

  // Movement logic
  useFrame((_, delta) => {
    const model = group.current;
    if (!model) return;

    const direction = new THREE.Vector3();
    if (keys["w"]) direction.z -= 1;
    if (keys["s"]) direction.z += 1;
    if (keys["a"]) direction.x -= 1;
    if (keys["d"]) direction.x += 1;

    if (direction.length() > 0) {
      // Normalize and move
      direction.normalize();
      model.position.addScaledVector(direction, speed);
      const angle = Math.atan2(direction.x, direction.z);
      model.rotation.y = angle;

      // Play walking animation if available
      const walkAnim = animations.find((a) => a.name.toLowerCase().includes("walk"));
      if (walkAnim) playAction(walkAnim.name);
      else playAction(animations[0].name);
    } else {
      // Play idle animation
      const idleAnim = animations.find((a) => a.name.toLowerCase().includes("idle"));
      if (idleAnim) playAction(idleAnim.name);
    }

    mixer.update(delta);
  });

  return (
    <group ref={group} scale={[1, 1, 1]} position={[0, 0, 0]}>
      <primitive object={scene} />
    </group>
  );
}
