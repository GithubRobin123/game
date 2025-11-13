import React, { useEffect, useRef } from "react";
import type { GameEngine } from "../game/engine";
import { GAME_CONFIG, clamp } from "../game/config";

export const GameViewFront: React.FC<{ engine: GameEngine }> = ({ engine }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);

  const render = () => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const p = engine.state.player;
    const c = Math.cos(p.rot), s = Math.sin(p.rot);

    const aheadX = clamp(p.x + c * 220 - canvas.width / 2 / 1.6, 0, GAME_CONFIG.world.width - canvas.width);
    const aheadY = clamp(p.y + s * 220 - canvas.height / 2 / 1.6, 0, GAME_CONFIG.world.height - canvas.height);
    engine.render(ctx, { x: aheadX, y: aheadY, scale: 1.6 });
  };

  // exposed for the master to call each frame from Top view
  (render as any).__isCameraRender = true;

  useEffect(() => { render(); });

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <label style={{ color: "#fff", fontSize: 12, marginBottom: 4, opacity: 0.7 }}>Front / Eye</label>
      <canvas ref={ref} width={400} height={240} style={{ borderRadius: 10, border: "1px solid #31343a", background: "#101214" }} />
    </div>
  );
};
