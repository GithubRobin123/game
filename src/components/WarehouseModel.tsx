import React from "react";
import { useGLTF } from "@react-three/drei";

export default function WarehouseModel() {
  const { scene } = useGLTF("/models/warehouse.glb");
  scene.traverse((obj: any) => {
    if (obj.isMesh) {
      obj.castShadow = true;
      obj.receiveShadow = true;
    }
  });

  return (
    <primitive 
      object={scene} 
      scale={1.2} 
      position={[0, 0, 0]}
    />
  );
}
