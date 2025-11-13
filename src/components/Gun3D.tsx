import { useGLTF } from "@react-three/drei";
import { useEffect } from "react";
import * as THREE from "three";

interface Gun3DProps {
  attachTo?: THREE.Object3D | null;
}

export default function Gun3D({ attachTo }: Gun3DProps) {
  const { scene } = useGLTF("/models/akm.glb") as any;

  useEffect(() => {
    if (attachTo) {
      attachTo.add(scene);
      scene.scale.set(0.045, 0.045, 0.045);
      scene.rotation.set(0, Math.PI, 0);
      scene.position.set(0.05, 0.02, 0);
    }
  }, [attachTo, scene]);

  return null;
}
