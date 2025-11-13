import { useGLTF } from "@react-three/drei";
import { useEffect } from "react";
import * as THREE from "three";

interface Character3DProps {
  onAttachGun?: (bone: THREE.Object3D) => void;
}

export default function Character3D({ onAttachGun }: Character3DProps) {
  const { scene } = useGLTF("/models/Sniper_Stand.glb") as any;

//   console.log('scene', scene)

  useEffect(() => {
    const rightHand: THREE.Object3D | undefined = scene.getObjectByName("mixamorigRightHand");
    if (rightHand && onAttachGun) onAttachGun(rightHand);
  }, [scene, onAttachGun]);

  return <primitive object={scene} scale={1.2} position={[0, -1, 0]} />;
}
