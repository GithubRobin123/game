import React, { useEffect, useRef } from "react";
import type { GameEngine } from "../game/engine";
import { GAME_CONFIG, clamp } from "../game/config";

export const GameViewRear: React.FC<{ engine: GameEngine }> = ({ engine }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);

  const render = () => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const p = engine.state.player;
    const c = Math.cos(p.rot), s = Math.sin(p.rot);

    const rearX = clamp(p.x - c * 260 - canvas.width / 2 / 1.2, 0, GAME_CONFIG.world.width - canvas.width);
    const rearY = clamp(p.y - s * 260 - canvas.height / 2 / 1.2, 0, GAME_CONFIG.world.height - canvas.height);
    engine.render(ctx, { x: rearX, y: rearY, scale: 1.2 });
  };

  (render as any).__isCameraRender = true;

  useEffect(() => { render(); });

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <label style={{ color: "#fff", fontSize: 12, marginBottom: 4, opacity: 0.7 }}>Rear / Below</label>
      <canvas ref={ref} width={400} height={240} style={{ borderRadius: 10, border: "1px solid #31343a", background: "#101214" }} />
    </div>
  );
};
