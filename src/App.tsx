// src/App.tsx
import { Canvas } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import FPSMap from "./FPSMap";
import PlayerRig from "./components/PlayerRig";
import Enemies from "./components/Enemies";
import Hud from "./components/Hud";
import { Suspense } from "react";
import { WorldProvider } from "./world/WorldContext";
import Apps from "./components/AllinOne";
import GameScene from "./components/gamesceen";

export default function App() {
  return (
    // <div style={{ width: "100vw", height: "100vh", background: "#0d0e11" }}>
    //   <WorldProvider>
    //     <Canvas shadows camera={{ position: [0, 1.6, 6], fov: 60 }}>
    //       <ambientLight intensity={0.7} />
    //       <directionalLight position={[6, 12, 6]} intensity={1.1} castShadow />
    //       <Suspense fallback={null}>
    //         <FPSMap />
    //         <Enemies count={6} />
    //       </Suspense>
    //       <PlayerRig />
    //       <Sky sunPosition={[100, 20, 100]} turbidity={8} />
    //     </Canvas>
    //     <Hud />
    //   </WorldProvider>
    // </div>
    <Apps  />
  //  <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
  //     <GameScene />
  //   </div> 
  // 
   );
}
